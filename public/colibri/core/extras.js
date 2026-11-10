// Colibri UI: primitives added after the Radix audit (Toolbar, Segmented control, Checkbox/Radio cards,
// Checkbox group, Tab nav, Accessible icon). Headless: state lives in ARIA + data-state, styling is the theme's job.
import { parts, emit, setState, btn, once, bag, roving, isDisabled, uid } from "./util.js";

// <div data-ui="toolbar" aria-label="Formatting" [data-orientation=vertical]> buttons, links, toggle-groups, separators </div>
// One tab stop for the whole bar; arrows/Home/End move between controls (WAI-ARIA toolbar pattern).
export function createToolbar(root, o = {}) {
  return once(root, "__uiToolbar", () => {
    const b = bag(), orientation = o.orientation || root.dataset.orientation || "horizontal";
    root.setAttribute("role", "toolbar"); root.setAttribute("aria-orientation", orientation);
    const items = () => [...root.querySelectorAll("button,a[href],input,select")].filter((el) => !el.closest("[hidden]") && el.closest("[data-ui=toolbar]") === root);
    let cur = null;
    const render = () => { const l = items(); if (!cur || !l.includes(cur)) cur = l.find((i) => !isDisabled(i)); l.forEach((i) => (i.tabIndex = i === cur ? 0 : -1)); };
    b.on(root, "focusin", (e) => { if (items().includes(e.target)) { cur = e.target; render(); } });
    b.on(root, "keydown", (e) => { if (e.target.matches("input,select") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const n = roving(items(), document.activeElement, e.key, { orientation }); if (n) { e.preventDefault(); e.stopPropagation(); cur = n; render(); n.focus(); } }, true);
    queueMicrotask(render); render();
    return { refresh: render, destroy: b.off };
  });
}

// <div data-ui="segmented-control" data-default-value="week" aria-label="Range"><button data-ui-part="item" data-value="day">Day</button>…</div>
// Single-select radiogroup with a sliding thumb: sets --seg-x / --seg-w on root for the theme to animate.
export function createSegmentedControl(root, o = {}) {
  return once(root, "__uiSegmented", () => {
    const b = bag(), items = () => parts(root, "item");
    let value = o.defaultValue ?? root.dataset.defaultValue ?? items()[0]?.dataset.value;
    root.setAttribute("role", "radiogroup");
    let thumb = root.querySelector(":scope>[data-ui-part=thumb]");
    if (!thumb) { thumb = document.createElement("span"); thumb.dataset.uiPart = "thumb"; thumb.setAttribute("aria-hidden", "true"); root.prepend(thumb); }
    const place = () => { const on = items().find((i) => i.dataset.value === value); if (!on) return;
      root.style.setProperty("--seg-x", on.offsetLeft + "px"); root.style.setProperty("--seg-w", on.offsetWidth + "px"); root.style.setProperty("--seg-y", on.offsetTop + "px"); root.style.setProperty("--seg-h", on.offsetHeight + "px"); };
    const render = () => { items().forEach((i) => { btn(i); i.setAttribute("role", "radio"); const on = i.dataset.value === value; i.setAttribute("aria-checked", String(on)); setState(i, on ? "on" : "off"); i.tabIndex = on ? 0 : -1; });
      root.dataset.value = value ?? ""; place(); };
    const set = (v) => { if (v === value) return; value = v; render(); o.onValueChange?.(v); emit(root, "change", { value: v }); };
    b.on(root, "click", (e) => { const i = e.target.closest("[data-ui-part=item]"); if (i && !isDisabled(i)) set(i.dataset.value); });
    b.on(root, "keydown", (e) => { const i = e.target.closest("[data-ui-part=item]"); const n = i && roving(items(), i, e.key, { orientation: "horizontal" }); if (n) { e.preventDefault(); set(n.dataset.value); n.focus(); } });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null; ro?.observe(root);
    render(); requestAnimationFrame(() => root.dataset.ready = "");
    return { get value() { return value; }, set value(v) { set(v); }, destroy() { b.off(); ro?.disconnect(); } };
  });
}

// Checkbox cards / Radio cards / Checkbox group: native inputs inside labels (works without JS);
// JS mirrors checked → data-state on each [data-ui-part=item] label and value on root.
//  <div data-ui="radio-cards" aria-label="Plan"><label data-ui-part="item"><input type="radio" name="plan" value="pro" checked> Pro <small>…</small></label>…</div>
function choiceGroup(key) {
  return (root, o = {}) => once(root, key, () => {
    const b = bag(), items = () => parts(root, "item");
    const radio = () => root.querySelector("input[type=radio]") != null;
    root.setAttribute("role", radio() ? "radiogroup" : "group");
    const render = () => { const vals = []; items().forEach((l) => { const i = l.querySelector("input"); const on = !!i?.checked; setState(l, on ? "checked" : "unchecked"); if (i?.disabled) l.dataset.disabled = ""; if (on) vals.push(i.value); });
      root.dataset.value = vals.join(","); return radio() ? (vals[0] ?? null) : vals; };
    b.on(root, "change", () => { const v = render(); o.onValueChange?.(v); emit(root, "change", { value: v }); });
    render();
    return { get value() { return render(); }, destroy: b.off };
  });
}
export const createCheckboxCards = choiceGroup("__uiCheckboxCards");
export const createRadioCards = choiceGroup("__uiRadioCards");
export const createCheckboxGroup = choiceGroup("__uiCheckboxGroup");

// <nav data-ui="tab-nav" aria-label="Settings"><a data-ui-part="link" href="#account">Account</a>…</nav>
// Tabs that are real links (routing, not panels): marks aria-current=page from the URL or the last click.
export function createTabNav(root, o = {}) {
  return once(root, "__uiTabNav", () => {
    const b = bag(), links = () => parts(root, "link");
    const mark = (a) => { if (a && !links().includes(a)) return; links().forEach((l) => { const on = l === a; on ? l.setAttribute("aria-current", "page") : l.removeAttribute("aria-current"); setState(l, on ? "active" : "inactive"); }); };
    const fromUrl = () => links().find((l) => l.getAttribute("aria-current") === "page") || links().find((l) => l.href === location.href || (l.hash && l.hash === location.hash)) || links()[0];
    b.on(root, "click", (e) => { const a = e.target.closest("[data-ui-part=link]"); if (a && links().includes(a)) { mark(a); emit(root, "change", { href: a.getAttribute("href") }); } });
    b.on(root, "keydown", (e) => { const a = e.target.closest("[data-ui-part=link]"); const n = a && links().includes(a) && roving(links(), a, e.key, { orientation: "horizontal" }); if (n) { e.preventDefault(); n.focus(); } });
    b.on(window, "hashchange", () => mark(fromUrl()));
    mark(fromUrl());
    return { select: mark, destroy: b.off };
  });
}

// <span data-ui="accessible-icon" data-label="Close"><svg>…</svg></span>  → icon hidden from AT, label read instead.
export function createAccessibleIcon(root) {
  return once(root, "__uiAccIcon", () => {
    root.querySelectorAll("svg,img,i").forEach((s) => { s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false"); });
    let l = root.querySelector(":scope>.sr-only"); if (!l && root.dataset.label) { l = document.createElement("span"); l.className = "sr-only"; l.textContent = root.dataset.label; root.append(l); }
    return { destroy() {} };
  });
}
