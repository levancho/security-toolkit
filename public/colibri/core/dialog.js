import { owner, trackController } from "./util.js";
// @colibri-kit/ui core: Dialog controller. Headless; built on the native <dialog> element.
//
//   <div data-ui="dialog" [data-modal="true|false"] [data-default-open] [data-dismissible="true|false"]
//        [data-close-on-backdrop="true|false"]>
//     <button data-ui-part="trigger">Open</button>          (optional, can be anywhere inside root)
//     <dialog data-ui-part="content">
//       <h2 data-ui-part="title">Title</h2>
//       <p data-ui-part="description">Optional text</p>
//       ... any content, incl. other Colibri UI components ...
//       <button data-ui-part="close" [data-ui-return="ok"]>Close</button>
//     </dialog>
//   </div>
//
// State out: root/trigger/content get data-state="open|closed"; trigger gets aria-expanded.
// Events (bubble from root): "ui:open", "ui:close" detail {returnValue}.  Cancellable "ui:beforeclose".
// Focus: native <dialog> focuses [autofocus] or first focusable; focus returns to the opener on close.

let uid = 0;
const bool = (v, d) => (v == null ? d : v !== "false");

export function createDialog(root, options = {}) {
  if (root.__uiDialog) return root.__uiDialog;
  const own = (el) => owner(el) === root; // nested components (tabs, menus…) keep their own parts
  const parts = (p) => [...root.querySelectorAll(`[data-ui-part="${p}"]`)].filter(own);
  const content = parts("content")[0];
  if (!content || content.tagName !== "DIALOG") throw new Error('colibri-ui dialog: needs <dialog data-ui-part="content">');
  // ['dialog','alert-dialog','sheet','drawer'] all use this core

  const id = root.id || `ui-dialog-${++uid}`;
  const opt = (k, d) => (options[k] ?? bool(root.dataset[k], d));
  const modal = () => opt("modal", true);
  const variant = options.variant || root.dataset.variant || (root.dataset.ui === "alert-dialog" ? "alert" : root.dataset.ui === "sheet" || root.dataset.ui === "drawer" ? "sheet" : "default");
  const dismissible = () => opt("dismissible", variant !== "alert");
  const closeOnBackdrop = () => opt("closeOnBackdrop", variant !== "alert");
  if (variant === "alert") content.setAttribute("role", "alertdialog");
  if (variant === "sheet") content.dataset.side = root.dataset.side || "right";   // CSS positions it; behaviour = modal dialog
  content.dataset.variant = variant;
  let opener = null;

  // wiring
  const title = parts("title")[0], desc = parts("description")[0];
  if (title) { title.id ||= `${id}-title`; content.setAttribute("aria-labelledby", title.id); }
  if (desc)  { desc.id  ||= `${id}-desc`;  content.setAttribute("aria-describedby", desc.id); }
  content.id ||= `${id}-content`;
  parts("trigger").forEach((t) => {
    if (t.tagName === "BUTTON" && !t.hasAttribute("type")) t.type = "button";
    t.setAttribute("aria-haspopup", "dialog");
    t.setAttribute("aria-controls", content.id);
  });
  parts("close").forEach((c) => { if (c.tagName === "BUTTON" && !c.hasAttribute("type")) c.type = "button"; });

  function render(open) {
    const s = open ? "open" : "closed";
    root.dataset.state = s; content.dataset.state = s;
    parts("trigger").forEach((t) => { t.dataset.state = s; t.setAttribute("aria-expanded", String(open)); });
  }

  const isOpen = () => content.open;

  function open(from) {
    if (isOpen()) return;
    // explicit trigger wins: Safari (and scripted clicks) don't focus buttons on click
    opener = from || root.ownerDocument.activeElement;
    if (modal() && typeof content.showModal === "function") content.showModal();
    else if (typeof content.show === "function") content.show();
    else content.setAttribute("open", "");           // very old browsers / test DOMs
    render(true);
    options.onOpenChange?.(true);
    root.dispatchEvent(new CustomEvent("ui:open", { bubbles: true }));
  }

  function close(returnValue = "") {
    if (!isOpen()) return;
    const ev = new CustomEvent("ui:beforeclose", { bubbles: true, cancelable: true, detail: { returnValue } });
    if (!root.dispatchEvent(ev)) return;
    if (typeof content.close === "function") content.close(returnValue); else content.removeAttribute("open");
    finishClose(returnValue);
  }

  function finishClose(returnValue) {
    render(false);
    if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus();
    opener = null;
    options.onOpenChange?.(false);
    root.dispatchEvent(new CustomEvent("ui:close", { bubbles: true, detail: { returnValue } }));
  }

  function onClick(e) {
    const t = e.target.closest('[data-ui-part="trigger"],[data-ui-part="close"]');
    if (t && own(t)) {
      if (t.dataset.uiPart === "trigger") open(t);
      else close(t.dataset.uiReturn ?? t.value ?? "");
      return;
    }
    // click on the ::backdrop lands on the <dialog> element itself, outside its content box
    if (e.target === content && closeOnBackdrop() && dismissible() && modal()) {
      const r = content.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close("backdrop");
    }
  }

  // Esc -> native "cancel" event
  function onCancel(e) { e.preventDefault(); if (dismissible()) close("escape"); }
  // <form method="dialog"> submits close the dialog natively -> keep state in sync
  function onNativeClose() { if (root.dataset.state === "open") finishClose(content.returnValue); }

  root.addEventListener("click", onClick);
  content.addEventListener("cancel", onCancel);
  content.addEventListener("close", onNativeClose);

  render(false);
  if (options.defaultOpen ?? root.hasAttribute("data-default-open")) open();

  const api = {
    get open() { return isOpen(); },
    show: () => open(), close,
    toggle: () => (isOpen() ? close() : open()),
    destroy() {
      root.removeEventListener("click", onClick);
      content.removeEventListener("cancel", onCancel);
      content.removeEventListener("close", onNativeClose);
      if (content.open) { if (typeof content.close === "function") content.close(); else content.removeAttribute("open"); }
      opener = null; render(false);
      delete root.__uiDialog;
    },
  };
  root.__uiDialog = trackController(root, api);
  return api;
}
