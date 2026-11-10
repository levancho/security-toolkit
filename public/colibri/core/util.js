// Colibri UI shared helpers (internal). No styling, no deps.
let _uid = 0;
export const uid = (p = "ui") => `${p}-${++_uid}`;
export const bool = (v, d) => (v == null ? d : v !== "false");
/** parts of `root` whose nearest [data-ui] ancestor is root (nested components stay isolated; a part that is itself a component, e.g. data-ui=button data-ui-part=trigger, still belongs to its parent) */
/** the component an element belongs to (a part that is itself a component belongs to its parent) */
export const owner = (el) => (el.hasAttribute("data-ui") ? el.parentElement?.closest("[data-ui]") : el.closest("[data-ui]"));
export const parts = (root, part, sel = "") =>
  [...root.querySelectorAll(`[data-ui-part="${part}"]${sel}`)].filter((el) => owner(el) === root);
export const part = (root, p, sel) => parts(root, p, sel)[0] || null;
export const emit = (el, name, detail, cancelable = false) =>
  el.dispatchEvent(new CustomEvent(`ui:${name}`, { bubbles: true, cancelable, detail }));
export const setState = (el, s) => el && (el.dataset.state = s);
export const btn = (el) => { if (el && el.tagName === "BUTTON" && !el.hasAttribute("type")) el.type = "button"; return el; };
export const isDisabled = (el) => el.disabled || el.dataset.disabled != null || el.getAttribute("aria-disabled") === "true";
// Track controller ownership without retaining detached DOM trees.
const instances = new WeakMap();
export const controllers = (root) => [...(instances.get(root) || [])];
export function trackController(root, api) {
  if (!api || controllers(root).includes(api)) return api;
  root.setAttribute?.('data-colibri-controller','');
  const owned = instances.get(root) || new Set(); owned.add(api); instances.set(root, owned);
  const destroy = api.destroy; let destroyed = false;
  api.destroy = () => {
    if (destroyed) return; destroyed = true;
    try {
      const Event = root.ownerDocument?.defaultView?.CustomEvent;
      if (Event) root.dispatchEvent(new Event("ui:destroy", { bubbles: false }));
      destroy?.call(api);
    } finally { owned.delete(api); if (!owned.size) { instances.delete(root); root.removeAttribute?.('data-colibri-controller'); } }
  };
  return api;
}
/** Dispose a removed subtree, innermost first. Safe to call more than once. */
export function dispose(root) {
  const nodes = [...(root.querySelectorAll?.("[data-ui],[data-colibri-controller]") || [])].reverse();
  nodes.push(root);
  for (const node of nodes) for (const api of controllers(node)) api.destroy?.();
}
/** register on root once; returns cached api */
export function once(root, key, factory) {
  if (root[key]) return root[key];
  const api = factory(); root[key] = api;
  const destroy = api.destroy;
  api.destroy = () => { try { destroy?.call(api); } finally { if (root[key] === api) delete root[key]; } };
  return trackController(root, api);
}
/** listeners bag with single teardown */
export function bag() {
  const offs = [];
  return {
    on(t, ev, fn, o) { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); },
    off() { offs.splice(0).forEach((f) => f()); },
  };
}
/** roving focus over items: arrows/Home/End; returns index-based mover */
export function roving(items, current, key, { orientation = "both", loop = true } = {}) {
  const list = items.filter((i) => !isDisabled(i));
  if (!list.length) return null;
  const i = Math.max(0, list.indexOf(current));
  const next = ["ArrowDown", "ArrowRight"].filter((k) => orientation === "both" || (orientation === "vertical" ? k === "ArrowDown" : k === "ArrowRight"));
  const prev = ["ArrowUp", "ArrowLeft"].filter((k) => orientation === "both" || (orientation === "vertical" ? k === "ArrowUp" : k === "ArrowLeft"));
  if (next.includes(key)) return list[loop ? (i + 1) % list.length : Math.min(i + 1, list.length - 1)];
  if (prev.includes(key)) return list[loop ? (i - 1 + list.length) % list.length : Math.max(i - 1, 0)];
  if (key === "Home") return list[0];
  if (key === "End") return list[list.length - 1];
  return null;
}
/** typeahead: find next item whose text starts with buffered chars */
export function typeahead() {
  let buf = "", t;
  return (items, current, ch) => {
    clearTimeout(t); t = setTimeout(() => (buf = ""), 500); buf += ch.toLowerCase();
    const list = items.filter((i) => !isDisabled(i));
    const start = Math.max(0, list.indexOf(current));
    const order = [...list.slice(start + (buf.length === 1 ? 1 : 0)), ...list.slice(0, start + 1)];
    return order.find((i) => (i.dataset.label || i.textContent).trim().toLowerCase().startsWith(buf)) || null;
  };
}
/** minimal positioning: position:fixed next to anchor with flip. Styling may override via CSS. */
export function place(floating, anchor, { side = "bottom", align = "start", offset = 6, point } = {}) {
  if (floating.dataset.position === "none") return;
  const view = floating.ownerDocument.defaultView;
  floating.style.position = "fixed"; floating.style.margin = "0";
  // Remove a newly unhidden layer from flex/grid layout before measuring its
  // anchor; otherwise the trigger moves again after the popup is positioned.
  const a = point ? { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 } : anchor.getBoundingClientRect();
  const f = floating.getBoundingClientRect();
  const vw = view.innerWidth, vh = view.innerHeight;
  let s = side;
  if (s === "bottom" && a.bottom + offset + f.height > vh && a.top - offset - f.height >= 0) s = "top";
  else if (s === "top" && a.top - offset - f.height < 0) s = "bottom";
  else if (s === "right" && a.right + offset + f.width > vw) s = "left";
  else if (s === "left" && a.left - offset - f.width < 0) s = "right";
  let x, y;
  if (s === "bottom" || s === "top") {
    y = s === "bottom" ? a.bottom + offset : a.top - offset - f.height;
    x = align === "end" ? a.right - f.width : align === "center" ? a.left + a.width / 2 - f.width / 2 : a.left;
  } else {
    x = s === "right" ? a.right + offset : a.left - offset - f.width;
    y = align === "end" ? a.bottom - f.height : align === "center" ? a.top + a.height / 2 - f.height / 2 : a.top;
  }
  floating.style.left = `${Math.max(4, Math.min(x, vw - f.width - 4))}px`;
  floating.style.top = `${Math.max(4, Math.min(y, vh - f.height - 4))}px`;
  floating.dataset.side = s; floating.dataset.align = align;
}
/** stack of open dismissable layers: Esc + outside pointer close the topmost only */
const layers = [];
export function layer(el, close, { outside = true, escape = true, ignore = [] } = {}) {
  const doc = el.ownerDocument;
  const entry = { el, close };
  const onKey = (e) => { if (e.key === "Escape" && escape && layers[layers.length - 1] === entry) { e.preventDefault(); close("escape"); } };
  const onDown = (e) => {
    if (!outside || layers[layers.length - 1] !== entry) return;
    if (el.contains(e.target) || ignore.some((i) => i && i.contains(e.target))) return;
    close("outside");
  };
  layers.push(entry);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("pointerdown", onDown, true);
  return () => {
    const i = layers.indexOf(entry); if (i >= 0) layers.splice(i, 1);
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("pointerdown", onDown, true);
  };
}

/** A callable cleanup with the same ownership/idempotence contract as controllers. */
export function cleanupController(root,key,teardown) {
 if(root[key])return root[key];
 const cleanup=()=>cleanup.destroy();
 cleanup.destroy=()=>{try{teardown();}finally{delete root[key];}};
 root[key]=cleanup;trackController(root,cleanup);return cleanup;
}
