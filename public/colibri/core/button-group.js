// Button group: joined related buttons.
// <div data-ui="button-group" data-label="Text align" [data-type="single|multiple"] [data-value="center"] [data-orientation="vertical"] [data-name="align"] [data-required]>
//   <button data-value="left">Left</button> ...
// - no data-type: plain action group (role=group); arrow keys move focus (roving tabindex).
// - data-type=single|multiple: buttons become toggles with aria-pressed; emits "ui:change" {value}.
//   data-required (single): clicking the pressed button does not clear it. data-name: keeps hidden inputs for forms.
import { once, bag, emit, roving, isDisabled } from "./util.js";

export function createButtonGroup(root, o = {}) {
  return once(root, "__uiButtonGroup", () => {
    const b = bag(), type = o.type ?? root.dataset.type ?? "", vertical = root.dataset.orientation === "vertical";
    const items = () => [...root.querySelectorAll(":scope > button, :scope > [data-ui-part=item], :scope > a")];
    root.setAttribute("role", "group");
    if (root.dataset.label && !root.hasAttribute("aria-label")) root.setAttribute("aria-label", root.dataset.label);
    if (vertical) root.setAttribute("aria-orientation", "vertical");
    items().forEach((el, i) => { if (el.tagName === "BUTTON" && !el.hasAttribute("type")) el.type = "button"; el.dataset.value ??= el.textContent.trim() || String(i); });
    let value = new Set(String(o.value ?? root.dataset.value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    if (type === "single" && value.size > 1) value = new Set([[...value][0]]);
    const syncInputs = () => {
      if (!root.dataset.name) return;
      root.querySelectorAll(":scope > input[data-bg-input]").forEach((x) => x.remove());
      (value.size ? [...value] : [""]).forEach((v) => { const x = document.createElement("input"); x.type = "hidden"; x.name = root.dataset.name; x.value = v; x.dataset.bgInput = ""; root.append(x); });
    };
    const render = () => {
      items().forEach((el) => {
        if (type) { const on = value.has(el.dataset.value); el.setAttribute("aria-pressed", String(on)); el.dataset.state = on ? "on" : "off"; }
      });
      syncInputs();
    };
    let focusEl = null;
    const setTab = (t) => { focusEl = t; items().forEach((el) => (el.tabIndex = el === t ? 0 : -1)); };
    const firstTab = () => items().find((el) => !isDisabled(el) && el.getAttribute("aria-pressed") === "true") || items().find((el) => !isDisabled(el));
    const getValue = () => (type === "single" ? ([...value][0] ?? null) : [...value]);
    const toggle = (v, fire = true) => {
      if (type === "single") { if (value.has(v)) { if (root.hasAttribute("data-required")) return; value.clear(); } else value = new Set([v]); }
      else if (type === "multiple") value.has(v) ? value.delete(v) : value.add(v);
      else return;
      render(); if (fire) emit(root, "change", { value: getValue() });
    };
    b.on(root, "click", (e) => {
      const el = e.target.closest("button, [data-ui-part=item], a"); if (!el || el.parentElement !== root || isDisabled(el)) return;
      setTab(el);
      if (!type) { // action group: mark the action that just ran (data-state=activated) so the click is visible
        items().forEach((x) => x !== el && x.dataset.state === "activated" && delete x.dataset.state);
        el.dataset.state = "activated"; clearTimeout(el.__bgT); el.__bgT = setTimeout(() => { if (el.dataset.state === "activated") delete el.dataset.state; }, root.dataset.flash ? Number(root.dataset.flash) : 1200);
        emit(root, "action", { value: el.dataset.value });
      }
      toggle(el.dataset.value);
    });
    b.on(root, "keydown", (e) => {
      const cur = e.target.closest("button, [data-ui-part=item], a"); if (!cur || cur.parentElement !== root) return;
      let key = e.key;
      if (document.documentElement.dir === "rtl" || getComputedStyle(root).direction === "rtl") key = { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" }[key] || key;
      const next = roving(items(), cur, key, { orientation: vertical ? "vertical" : "horizontal" });
      if (next) { e.preventDefault(); setTab(next); next.focus(); }
    });
    b.on(root, "focusin", (e) => { const el = e.target.closest("button, [data-ui-part=item], a"); if (el && el.parentElement === root) setTab(el); });
    render(); setTab(firstTab());
    return {
      get value() { return getValue(); },
      set value(v) { value = new Set((Array.isArray(v) ? v : v == null ? [] : [v]).map(String)); render(); setTab(firstTab()); },
      toggle, destroy: b.off,
    };
  });
}

// Spinner: <span data-ui="spinner" [data-variant="ring|dots|bars"] [data-size="sm|md|lg|xl"] [data-label="Saving…"]></span>
// role=status + polite live region with a visually hidden label; api.start()/stop()/label.
export function createSpinner(root, o = {}) {
  return once(root, "__uiSpinner", () => {
    root.setAttribute("role", "status"); root.setAttribute("aria-live", "polite");
    const visibleText = root.textContent.trim();
    let sr = root.querySelector(":scope > [data-ui-part=label]");
    if (!sr && !visibleText) { sr = document.createElement("span"); sr.dataset.uiPart = "label"; root.append(sr); }
    if (sr && !sr.textContent.trim()) sr.textContent = o.label ?? root.dataset.label ?? root.getAttribute("aria-label") ?? "Loading…";
    root.removeAttribute("aria-label");
    const v = root.dataset.variant;
    if ((v === "dots" || v === "bars") && !root.querySelector(":scope > [data-ui-part=dot]")) {
      for (let i = 0; i < (v === "bars" ? 4 : 3); i++) { const d = document.createElement("span"); d.dataset.uiPart = "dot"; d.setAttribute("aria-hidden", "true"); d.style.setProperty("--i", i); root.prepend(d); }
    }
    root.dataset.state ??= "loading";
    return {
      start() { root.dataset.state = "loading"; root.hidden = false; },
      stop({ hide = true } = {}) { root.dataset.state = "idle"; if (hide) root.hidden = true; },
      get label() { return sr?.textContent ?? visibleText; }, set label(t) { if (sr) sr.textContent = t; },
      destroy() {},
    };
  });
}
