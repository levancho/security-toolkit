import { trackController } from "./util.js";
// @colibri-kit/ui core: Tabs controller. Headless: no styles, no framework, no custom elements.
// Works on any markup that follows the data-* contract below (FreeMarker, plain HTML, React refs).
//
//   <div data-ui="tabs" [data-orientation="horizontal|vertical"] [data-activation="auto|manual"]>
//     <div data-ui-part="list">
//       <button data-ui-part="trigger" data-value="a">A</button>
//       <button data-ui-part="trigger" data-value="b" disabled>B</button>
//     </div>
//     <div data-ui-part="panel" data-value="a">...</div>
//     <div data-ui-part="panel" data-value="b">...</div>
//   </div>
//
// State is exposed ONLY via attributes, so any external CSS can style it:
//   [data-state="active|inactive"], [aria-selected], [hidden], [data-disabled]
// Events (bubble): "ui:change" detail {value, previous}

import { owner, isDisabled } from "./util.js";

let uid = 0;
const q = (root, part) =>
  [...root.querySelectorAll(`[data-ui-part="${part}"]`)].filter(
    (el) => owner(el) === root // isolate all nested components, including tab-like parts
  );

export function createTabs(root, options = {}) {
  if (root.__uiTabs) return root.__uiTabs;
  const id = root.id || `ui-tabs-${++uid}`;
  const orientation = options.orientation || root.dataset.orientation || "horizontal";
  const activation = options.activation || root.dataset.activation || "auto";
  const onChange = options.onChange;
  let value = null;
  const generatedDisabled = new WeakSet();

  const triggers = () => q(root, "trigger");
  const panels = () => q(root, "panel");
  const enabled = () => triggers().filter((t) => !isDisabled(t));

  function wire() {
    const list = q(root, "list")[0];
    if (list) {
      list.setAttribute("role", "tablist");
      list.setAttribute("aria-orientation", orientation);
    }
    triggers().forEach((t) => {
      const v = t.dataset.value;
      t.id ||= `${id}-trigger-${v}`;
      t.setAttribute("role", "tab");
      const panel = panels().find((p) => p.dataset.value === v);
      if (panel) { panel.id ||= `${id}-panel-${v}`; t.setAttribute("aria-controls", panel.id); }
      else t.removeAttribute("aria-controls");
      if (generatedDisabled.has(t)) { t.removeAttribute("aria-disabled"); generatedDisabled.delete(t); }
      if (!t.hasAttribute("aria-disabled") && (t.disabled || t.dataset.disabled != null)) {
        t.setAttribute("aria-disabled", "true"); generatedDisabled.add(t);
      }
      if (t.tagName === "BUTTON" && !t.hasAttribute("type")) t.type = "button";

    });
    panels().forEach((p) => {
      const v = p.dataset.value;
      p.id ||= `${id}-panel-${v}`;
      p.setAttribute("role", "tabpanel");
      const trigger = triggers().find((t) => t.dataset.value === v);
      if (trigger) p.setAttribute("aria-labelledby", trigger.id);
      else p.removeAttribute("aria-labelledby");
      p.tabIndex = 0;
    });
  }

  function render() {
    triggers().forEach((t) => {
      const on = t.dataset.value === value;
      t.setAttribute("aria-selected", String(on));
      t.dataset.state = on ? "active" : "inactive";
      t.tabIndex = on ? 0 : -1;
    });
    panels().forEach((p) => {
      const on = p.dataset.value === value;
      p.dataset.state = on ? "active" : "inactive";
      p.hidden = !on;
    });
    root.dataset.value = value ?? "";
  }

  function select(next, { focus = false, silent = false } = {}) {
    const t = triggers().find((x) => x.dataset.value === next);
    if (!t || isDisabled(t)) return;
    const previous = value;
    value = next;
    render();
    if (focus) t.focus();
    if (!silent && previous !== next) {
      onChange?.(next, previous);
      root.dispatchEvent(new CustomEvent("ui:change", { bubbles: true, detail: { value: next, previous } }));
    }
  }

  function onClick(e) {
    const t = e.target.closest('[data-ui-part="trigger"]');
    if (t && triggers().includes(t)) select(t.dataset.value);
  }

  function onKeydown(e) {
    const t = e.target.closest('[data-ui-part="trigger"]');
    if (!t || !triggers().includes(t)) return;
    const list = enabled();
    if (!list.length || isDisabled(t)) return;
    const i = list.indexOf(t);
    const rtl = root.ownerDocument.defaultView.getComputedStyle(root).direction === "rtl";
    const prev = orientation === "vertical" ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
    const next = orientation === "vertical" ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
    let target = null;
    if (e.key === next) target = list[(i + 1) % list.length];
    else if (e.key === prev) target = list[(i - 1 + list.length) % list.length];
    else if (e.key === "Home") target = list[0];
    else if (e.key === "End") target = list[list.length - 1];
    else if ((e.key === "Enter" || e.key === " ") && activation === "manual") {
      e.preventDefault();
      return select(t.dataset.value);
    } else return;
    e.preventDefault();
    if (activation === "auto") select(target.dataset.value, { focus: true });
    else target.focus();
  }

  wire();
  const initial =
    options.value ?? root.dataset.defaultValue ??
    triggers().find((t) => t.getAttribute("aria-selected") === "true")?.dataset.value ??
    enabled()[0]?.dataset.value;
  select(enabled().some((t) => t.dataset.value === initial) ? initial : enabled()[0]?.dataset.value, { silent: true });
  render();

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);

  const api = {
    get value() { return value; },
    select: (v, options) => select(v, options),
    refresh() {
      wire();
      if (!enabled().some((t) => t.dataset.value === value)) {
        const next = enabled()[0]?.dataset.value;
        if (next != null) select(next);
        else value = null;
      }
      render();
    },   // call after adding/removing tabs
    destroy() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      triggers().forEach((t) => { if (generatedDisabled.has(t)) t.removeAttribute("aria-disabled"); });
      delete root.__uiTabs;
    },
  };
  root.__uiTabs = trackController(root, api);
  return api;
}
