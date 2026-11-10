// Colibri UI: Popover / Tooltip / HoverCard — one floating-layer core with different triggers.
//  <div data-ui="popover" [data-side="bottom|top|left|right"] [data-align="start|center|end"] [data-modal]>
//     <button data-ui-part="trigger">…</button>
//     <div data-ui-part="content" hidden>… <button data-ui-part="close">x</button></div></div>
//  data-ui="tooltip"    → opens on hover/focus after data-delay (default 500ms), role=tooltip, aria-describedby
//  data-ui="hover-card" → opens on hover/focus (default 300ms), stays open while pointer is over content
//  data-position="none" on content = skip built-in positioning (use CSS anchor positioning / your own).
import { uid, part, emit, setState, btn, once, bag, place, layer } from "./util.js";

function floating(root, o, mode) {
  const b = bag(), id = root.id || uid(`ui-${mode}`);
  const trigger = part(root, "trigger"), content = part(root, "content");
  if (!trigger || !content) throw new Error(`colibri-ui ${mode}: needs trigger + content parts`);
  btn(trigger); content.id ||= `${id}-content`;
  const isTip = mode === "tooltip";
  content.setAttribute("role", isTip ? "tooltip" : mode === "hover-card" ? "dialog" : (content.getAttribute("role") || "dialog"));
  if (isTip) trigger.setAttribute("aria-describedby", content.id);
  else { trigger.setAttribute("aria-haspopup", "dialog"); trigger.setAttribute("aria-controls", content.id); }
  const side = () => o.side || root.dataset.side || (isTip ? "top" : "bottom");
  const align = () => o.align || root.dataset.align || (isTip ? "center" : "start");
  const delay = Number(o.delay ?? root.dataset.delay ?? (isTip ? 500 : mode === "hover-card" ? 300 : 0));
  const closeDelay = Number(o.closeDelay ?? root.dataset.closeDelay ?? (mode === "hover-card" ? 200 : 0));
  let open = false, unlayer = null, t;
  const reposition = () => open && place(content, trigger, { side: side(), align: align() });
  const render = () => {
    [root, trigger, content].forEach((e) => setState(e, open ? "open" : "closed"));
    if (!isTip) trigger.setAttribute("aria-expanded", String(open));
    content.hidden = !open;
  };
  function set(v, reason) {
    clearTimeout(t); if (v === open) return;
    open = v; render();
    if (open) {
      reposition();
      unlayer = layer(content, (r) => set(false, r), { ignore: [trigger], outside: !isTip });
      if (mode === "popover") (content.querySelector("[autofocus]") || null)?.focus();
    } else { unlayer?.(); unlayer = null; if (mode === "popover" && reason !== "outside" && content.contains(root.ownerDocument.activeElement)) trigger.focus(); }
    o.onOpenChange?.(open); emit(root, open ? "open" : "close", { reason });
  }
  const later = (v, ms) => { clearTimeout(t); t = setTimeout(() => set(v, "hover"), ms); };
  if (mode === "popover") {
    b.on(trigger, "click", () => set(!open, "trigger"));
    b.on(content, "click", (e) => { if (e.target.closest('[data-ui-part="close"]')) set(false, "close"); });
  } else {
    for (const el of isTip ? [trigger] : [trigger, content]) {
      b.on(el, "pointerenter", () => later(true, open ? 0 : delay));
      b.on(el, "pointerleave", () => later(false, closeDelay));
    }
    b.on(trigger, "focus", () => set(true, "focus"));
    b.on(trigger, "blur", () => set(false, "blur"));
  }
  const view = root.ownerDocument.defaultView;
  b.on(view, "resize", reposition); b.on(view, "scroll", reposition, true);
  render();
  return {
    get open() { return open; }, show: () => set(true, "api"), hide: () => set(false, "api"), toggle: () => set(!open, "api"),
    reposition, destroy() { unlayer?.(); b.off(); },
  };
}
export const createPopover = (r, o = {}) => once(r, "__uiPopover", () => floating(r, o, "popover"));
export const createTooltip = (r, o = {}) => once(r, "__uiTooltip", () => floating(r, o, "tooltip"));
export const createHoverCard = (r, o = {}) => once(r, "__uiHoverCard", () => floating(r, o, "hover-card"));
