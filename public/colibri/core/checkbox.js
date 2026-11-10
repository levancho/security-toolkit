// Colibri UI: Checkbox (tri-state), Switch, RadioGroup. Native inputs first; ARIA-button fallback.
//  <input type="checkbox" data-ui="checkbox" [data-indeterminate]>   (native) or
//  <button data-ui="checkbox" aria-checked="mixed|true|false">       (custom)
//  <button data-ui="switch" aria-checked="true">  or <input type="checkbox" data-ui="switch">
//  <div data-ui="radio-group" [data-default-value] [data-orientation]><button data-ui-part="item" data-value="a">…</button>…</div>
//     (native <input type=radio> inside also works: items are inputs, we only add data-state)
//  Checkbox "select all": <input data-ui="checkbox" data-controls="#table [data-ui-part=row-select]"> → parent tri-state
import { parts, emit, setState, btn, once, bag, roving, isDisabled } from "./util.js";

function checkable(root, o, role) {
  const b = bag(), native = root.tagName === "INPUT";
  let v = native ? (root.dataset.indeterminate != null ? "mixed" : root.checked) : (root.getAttribute("aria-checked") === "mixed" ? "mixed" : root.getAttribute("aria-checked") === "true");
  if (!native) { btn(root); root.setAttribute("role", role); }
  else if (role === "switch") root.setAttribute("role", "switch");
  const render = () => {
    if (native) { root.indeterminate = v === "mixed"; root.checked = v === true; }
    root.setAttribute("aria-checked", v === "mixed" ? "mixed" : String(v));
    setState(root, v === "mixed" ? "indeterminate" : v ? "checked" : "unchecked");
  };
  const set = (n, silent) => { if (n === v) return; v = n; render(); if (!silent) { o.onCheckedChange?.(v); emit(root, "change", { checked: v }); } };
  if (native) b.on(root, "change", () => set(root.checked));
  else b.on(root, "click", () => !isDisabled(root) && set(v === true ? false : true));
  // optional "select all" wiring
  const sel = root.dataset.controls;
  if (sel && role === "checkbox") {
    const kids = () => [...root.ownerDocument.querySelectorAll(sel)];
    const sync = () => { const c = kids().map((k) => k.checked ?? k.getAttribute("aria-checked") === "true"); set(c.every(Boolean) && c.length ? true : c.some(Boolean) ? "mixed" : false, true); };
    b.on(root.ownerDocument, "change", (e) => { if (kids().includes(e.target)) sync(); });
    b.on(root, native ? "change" : "click", () => { kids().forEach((k) => { if (k.tagName === "INPUT") { k.checked = v === true; k.dispatchEvent(new Event("input", { bubbles: true })); } }); emit(root, "change", { checked: v }); });
    sync();
  }
  render();
  return { get checked() { return v; }, set checked(n) { set(n); }, destroy: b.off };
}
export const createCheckbox = (root, o = {}) => once(root, "__uiCheckbox", () => checkable(root, o, "checkbox"));
export const createSwitch = (root, o = {}) => once(root, "__uiSwitch", () => checkable(root, o, "switch"));

export function createRadioGroup(root, o = {}) {
  return once(root, "__uiRadioGroup", () => {
    const b = bag(), orientation = root.dataset.orientation || "both";
    const items = () => parts(root, "item");
    const native = () => items()[0]?.tagName === "INPUT";
    let value = o.defaultValue ?? root.dataset.defaultValue ?? items().find((i) => i.checked)?.value ?? null;
    if (!native()) { root.setAttribute("role", "radiogroup"); items().forEach((i) => { btn(i); i.setAttribute("role", "radio"); }); }
    const val = (i) => i.dataset.value ?? i.value;
    const render = () => {
      const list = items();
      list.forEach((i) => {
        const on = val(i) === value; setState(i, on ? "checked" : "unchecked");
        if (native()) i.checked = on; else { i.setAttribute("aria-checked", String(on)); i.tabIndex = on ? 0 : -1; }
      });
      if (!native() && !list.some((i) => val(i) === value)) list.find((i) => !isDisabled(i))?.setAttribute("tabindex", "0");
      root.dataset.value = value ?? "";
    };
    const set = (v) => { if (v === value) return; value = v; render(); o.onValueChange?.(v); emit(root, "change", { value: v }); };
    b.on(root, "click", (e) => { const i = e.target.closest('[data-ui-part="item"]'); if (i && items().includes(i) && !isDisabled(i)) set(val(i)); });
    b.on(root, "change", (e) => { if (items().includes(e.target)) set(e.target.value); });
    b.on(root, "keydown", (e) => {
      if (native()) return; const i = e.target.closest('[data-ui-part="item"]'); if (!i) return;
      if (e.key === " ") { e.preventDefault(); return set(val(i)); }
      const n = roving(items(), i, e.key, { orientation }); if (n) { e.preventDefault(); n.focus(); set(val(n)); }
    });
    render();
    return { get value() { return value; }, set value(v) { set(v); }, destroy: b.off };
  });
}
