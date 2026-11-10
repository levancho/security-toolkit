// Colibri UI: auto-initialise every [data-ui] element on the page (FreeMarker / plain HTML / HTMX).
// React apps should NOT use this; they call createX(ref.current) themselves.
import { registry } from "./registry.js";
import { initMotion } from "./motion.js";
import { dispose } from "./util.js";
export { registry, dispose };


/** Initialise components inside `scope`. Inner components first, so outer ones (e.g. a calendar inside
 *  a date-picker, or tabs inside a dialog) find their children already wired. */
export function init(scope = document) {
  const els = [...scope.querySelectorAll("[data-ui]")];
  if (scope.matches?.("[data-ui]")) els.unshift(scope);
  for (const el of els.reverse()) {
    const f = registry[el.dataset.ui];
    if (!f || el.closest("template")) continue;
    // date-picker owns its calendar; repeater rows initialise after insertion
    if (el.dataset.ui === "calendar" && el.closest('[data-ui="date-picker"]')) continue;
    try { f(el); } catch (e) { console.error(`[colibri-ui] ${el.dataset.ui}:`, e, el); }
  }
}

const observers = new WeakMap();
/** Match initialization with teardown when framework swaps remove nodes. Moves keep their API. */
export function observeRemovals(root = document) {
  if (observers.has(root)) return observers.get(root);
  const doc = root.ownerDocument || root, MO = doc.defaultView?.MutationObserver;
  if (!MO) return null;
  const observer = new MO(records => {
    for (const record of records) for (const node of record.removedNodes) {
      if (node.nodeType === 1 && !node.isConnected) dispose(node);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  const api = { disconnect() { observer.disconnect(); observers.delete(root); } };
  observers.set(root, api); return api;
}

if (typeof document !== "undefined" && !globalThis.__COLIBRI_UI_NO_AUTO__) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init());
  else init();
  observeRemovals(document);
  document.addEventListener("htmx:beforeCleanupElement", e => dispose(e.detail?.elt || e.target));
  initMotion(document); // exit animations (no-op without themes/motion.css tokens)
  document.addEventListener("ui:refresh", (e) => init(e.target instanceof Element ? e.target : document));
  document.addEventListener("htmx:afterSwap", (e) => init(e.target)); // HTMX support, no-op otherwise
}
