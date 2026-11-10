// Colibri UI: Toggle (pressed button) + ToggleGroup (single|multiple, roving focus).
//  <button data-ui="toggle" [aria-pressed="true"]>B</button>
//  <div data-ui="toggle-group" data-type="single|multiple" [data-default-value="b,i"] [data-orientation]>
//     <button data-ui-part="item" data-value="b">B</button>…</div>
import { parts, emit, setState, btn, once, bag, roving, isDisabled } from "./util.js";

export function createToggle(root, o = {}) {
  return once(root, "__uiToggle", () => {
    const b = bag(); btn(root);
    let on = o.defaultPressed ?? root.getAttribute("aria-pressed") === "true";
    const render = () => { root.setAttribute("aria-pressed", String(on)); setState(root, on ? "on" : "off"); };
    const set = (v) => { if (isDisabled(root) || v === on) return; on = v; render(); o.onPressedChange?.(on); emit(root, "change", { pressed: on }); };
    b.on(root, "click", () => set(!on)); render();
    return { get pressed() { return on; }, set pressed(v) { set(!!v); }, destroy: b.off };
  });
}

export function createToggleGroup(root, o = {}) {
  return once(root, "__uiToggleGroup", () => {
    const b = bag(), type = o.type || root.dataset.type || "single";
    const orientation = root.dataset.orientation || "horizontal";
    const items = () => parts(root, "item");
    let value = new Set(String(o.defaultValue ?? root.dataset.defaultValue ?? "").split(",").filter(Boolean));
    root.setAttribute("role", "group");
    items().forEach((i) => { btn(i); if (type === "single") i.setAttribute("role", "radio"); });
    if (type === "single") root.setAttribute("role", "radiogroup");
    const render = () => {
      const list = items(); let focusable = null;
      list.forEach((i) => {
        const on = value.has(i.dataset.value);
        i.setAttribute(type === "single" ? "aria-checked" : "aria-pressed", String(on));
        setState(i, on ? "on" : "off"); i.tabIndex = -1; if (on && !focusable) focusable = i;
      });
      (focusable || list.find((i) => !isDisabled(i)))?.setAttribute("tabindex", "0");
      root.dataset.value = [...value].join(",");
    };
    const toggle = (v) => {
      const was = value.has(v);
      if (type === "single") value = new Set(was ? [] : [v]); else was ? value.delete(v) : value.add(v);
      render(); const out = type === "single" ? ([...value][0] ?? null) : [...value];
      o.onValueChange?.(out); emit(root, "change", { value: out });
    };
    b.on(root, "click", (e) => { const i = e.target.closest('[data-ui-part="item"]'); if (i && items().includes(i) && !isDisabled(i)) toggle(i.dataset.value); });
    b.on(root, "keydown", (e) => { const i = e.target.closest('[data-ui-part="item"]'); const n = i && roving(items(), i, e.key, { orientation }); if (n) { e.preventDefault(); n.focus(); } });
    render();
    return { get value() { return type === "single" ? ([...value][0] ?? null) : [...value]; }, toggle, destroy: b.off };
  });
}
