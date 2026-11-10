// Colibri UI: DropdownMenu (Metronic Dropdown/Menu), ContextMenu, Menubar, NavigationMenu.
//  <div data-ui="dropdown-menu" [data-side] [data-align]>
//    <button data-ui-part="trigger">Actions</button>
//    <div data-ui-part="content" hidden>
//      <div data-ui-part="label">Group</div>
//      <button data-ui-part="item" [data-shortcut] [disabled]>Edit</button>
//      <button data-ui-part="item" data-type="checkbox" aria-checked="true">Show grid</button>
//      <div data-ui-part="radio-group" data-name="size">
//        <button data-ui-part="item" data-type="radio" data-value="s">S</button>…</div>
//      <hr data-ui-part="separator">
//      <div data-ui-part="sub"><button data-ui-part="sub-trigger">More</button>
//         <div data-ui-part="sub-content" hidden>…items…</div></div>
//    </div></div>
//  data-ui="context-menu": <div data-ui-part="area">right-click here</div> + content (opens at pointer / Shift+F10)
//  data-ui="menubar": several <div data-ui-part="menu"> each with trigger+content; ←/→ move between menus.
//  data-ui="navigation-menu": <ul data-ui-part="list"><li data-ui-part="menu"><button data-ui-part="trigger">…
//      <div data-ui-part="content">links</div></li>…</ul>  (hover or click; disclosure, not role=menu)
// Events: ui:open / ui:close / ui:select {item, value, checked}. Cancel ui:select to keep menu open.
import { uid, emit, setState, btn, once, bag, roving, typeahead, place, layer, isDisabled, owner } from "./util.js";

const Q = (el, p) => [...el.querySelectorAll(`:scope [data-ui-part="${p}"]`)];
// items belonging to this content level only (not nested sub-contents)
const levelItems = (content) => [...content.querySelectorAll('[data-ui-part="item"],[data-ui-part="sub-trigger"]')]
  .filter((i) => i.closest('[data-ui-part="content"],[data-ui-part="sub-content"]') === content && !isDisabled(i));

function menuLevel(content, { onClose, side = "bottom", align = "start", anchor, point, onSelect, onArrowOut }) {
  const b = bag(), ta = typeahead();
  content.setAttribute("role", "menu"); content.tabIndex = -1;
  content.querySelectorAll('[data-ui-part="separator"]').forEach((s) => s.setAttribute("role", "separator"));
  content.querySelectorAll('[data-ui-part="radio-group"]').forEach((g) => g.setAttribute("role", "group"));
  const items = () => levelItems(content);
  items().forEach((i) => {
    btn(i);
    const ty = i.dataset.type;
    i.setAttribute("role", ty === "checkbox" ? "menuitemcheckbox" : ty === "radio" ? "menuitemradio" : "menuitem");
    if (ty && !i.hasAttribute("aria-checked")) i.setAttribute("aria-checked", "false");
    if (i.dataset.uiPart === "sub-trigger") { i.setAttribute("aria-haspopup", "menu"); i.setAttribute("aria-expanded", "false"); }
    i.tabIndex = -1;
  });
  content.querySelectorAll('[data-ui-part="item"][disabled]').forEach((i) => i.setAttribute("aria-disabled", "true"));
  let sub = null;
  const closeSub = () => { sub?.close(); sub = null; };
  function openSub(st, focusFirst) {
    if (sub?.trigger === st) return;
    closeSub();
    const sc = st.parentElement.querySelector('[data-ui-part="sub-content"]'); if (!sc) return;
    sc.hidden = false; setState(sc, "open"); st.setAttribute("aria-expanded", "true"); setState(st, "open");
    const lvl = menuLevel(sc, { anchor: st, side: "right", align: "start", onSelect, onClose: () => {}, onArrowOut: () => { closeSub(); st.focus(); } });
    sub = { trigger: st, close() { lvl.destroy(); sc.hidden = true; setState(sc, "closed"); st.setAttribute("aria-expanded", "false"); setState(st, "closed"); } };
    if (focusFirst) items0(sc)?.focus();
  }
  const items0 = (c) => levelItems(c)[0];
  function activate(i) {
    if (i.dataset.uiPart === "sub-trigger") return openSub(i, true);
    const ty = i.dataset.type;
    if (ty === "checkbox") i.setAttribute("aria-checked", String(i.getAttribute("aria-checked") !== "true"));
    if (ty === "radio") {
      const g = i.closest('[data-ui-part="radio-group"]') || content;
      g.querySelectorAll('[data-type="radio"]').forEach((r) => { r.setAttribute("aria-checked", String(r === i)); setState(r, r === i ? "checked" : "unchecked"); });
    }
    if (ty) setState(i, i.getAttribute("aria-checked") === "true" ? "checked" : "unchecked");
    onSelect(i);
  }
  b.on(content, "click", (e) => {
    const i = e.target.closest('[data-ui-part="item"],[data-ui-part="sub-trigger"]');
    if (i && i.closest('[data-ui-part="content"],[data-ui-part="sub-content"]') === content && !isDisabled(i)) activate(i);
  });
  b.on(content, "pointermove", (e) => {
    const i = e.target.closest('[data-ui-part="item"],[data-ui-part="sub-trigger"]');
    if (!i || i.closest('[data-ui-part="content"],[data-ui-part="sub-content"]') !== content || isDisabled(i)) return;
    if (i.ownerDocument.activeElement !== i) i.focus();
    if (i.dataset.uiPart === "sub-trigger") openSub(i, false); else if (sub && !sub.trigger.parentElement.contains(i)) closeSub();
  });
  b.on(content, "keydown", (e) => {
    const cur = e.target.closest('[data-ui-part="item"],[data-ui-part="sub-trigger"]');
    if (cur && cur.closest('[data-ui-part="content"],[data-ui-part="sub-content"]') !== content) return; // let sub handle
    const list = items();
    if (e.key === "ArrowRight" && cur?.dataset.uiPart === "sub-trigger") { e.preventDefault(); return openSub(cur, true); }
    if (e.key === "ArrowLeft" && onArrowOut) { e.preventDefault(); e.stopPropagation(); return onArrowOut(); }
    if ((e.key === "Enter" || e.key === " ") && cur) { e.preventDefault(); return activate(cur); }
    if (e.key === "Tab") { onClose("tab"); return; }
    const n = roving(list, cur, e.key, { orientation: "vertical" }) ||
      (e.key.length === 1 && /\S/.test(e.key) ? ta(list, cur, e.key) : null);
    if (n) { e.preventDefault(); e.stopPropagation(); n.focus(); }
  });
  place(content, anchor, { side, align, point });
  return { items, closeSub, destroy() { closeSub(); b.off(); } };
}

function dropdown(root, o, kind) {
  const b = bag(), id = root.id || uid(`ui-${kind}`);
  const trigger = Q(root, "trigger").find((t) => owner(t) === root) || null;
  const area = kind === "context-menu" ? Q(root, "area")[0] : null;
  const content = Q(root, "content").find((c) => owner(c) === root);
  content.id ||= `${id}-content`; content.hidden = true;
  if (trigger) { btn(trigger); trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-controls", content.id); trigger.setAttribute("aria-expanded", "false"); }
  let open = false, lvl = null, unlayer = null;
  const side = o.side || root.dataset.side || "bottom", align = o.align || root.dataset.align || "start";
  function set(v, { point, focus = "first", reason } = {}) {
    if (v === open) return; open = v;
    [root, trigger, content].forEach((e) => e && setState(e, open ? "open" : "closed"));
    trigger?.setAttribute("aria-expanded", String(open));
    content.hidden = !open;
    if (open) {
      lvl = menuLevel(content, {
        anchor: trigger || area, point, side, align,
        onClose: (r) => set(false, { reason: r }),
        onSelect: (i) => {
          const ok = emit(root, "select", { item: i, value: i.dataset.value ?? i.textContent.trim(), checked: i.getAttribute("aria-checked") }, true);
          o.onSelect?.(i);
          if (ok && !i.dataset.type && root.dataset.closeOnSelect !== "false") set(false, { reason: "select" });
        },
        onArrowOut: o.onArrowOut,
      });
      const list = lvl.items(); (focus === "last" ? list[list.length - 1] : list[0])?.focus();
      unlayer = layer(content, (r) => set(false, { reason: r }), { ignore: [trigger] });
    } else {
      lvl?.destroy(); lvl = null; unlayer?.(); unlayer = null;
      if (reason !== "outside" && trigger) trigger.focus();
    }
    o.onOpenChange?.(open); emit(root, open ? "open" : "close", { reason });
  }
  if (trigger) {
    b.on(trigger, "click", () => set(!open, { reason: "trigger" }));
    b.on(trigger, "keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); set(true, { focus: "first" }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); set(true, { focus: "last" }); }
    });
  }
  if (area) {
    b.on(area, "contextmenu", (e) => { e.preventDefault(); if (open) set(false); set(true, { point: { x: e.clientX, y: e.clientY } }); });
    b.on(area, "keydown", (e) => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const r = area.getBoundingClientRect(); set(true, { point: { x: r.left, y: r.top } }); } });
    if (!area.hasAttribute("tabindex")) area.tabIndex = 0;
  }
  setState(root, "closed");
  return { get open() { return open; }, show: (p) => set(true, p), hide: () => set(false), trigger, destroy() { set(false); b.off(); } };
}
export const createDropdownMenu = (r, o = {}) => once(r, "__uiDropdownMenu", () => dropdown(r, o, "dropdown-menu"));
export const createContextMenu = (r, o = {}) => once(r, "__uiContextMenu", () => dropdown(r, o, "context-menu"));

export function createMenubar(root, o = {}) {
  return once(root, "__uiMenubar", () => {
    root.setAttribute("role", "menubar");
    const menus = [...root.querySelectorAll('[data-ui-part="menu"]')].filter((m) => m.parentElement.closest('[data-ui="menubar"]') === root);
    const apis = [];
    const move = (i, d) => { const n = apis[(i + d + apis.length) % apis.length]; apis[i].hide(); n.show(); };
    menus.forEach((m, i) => {
      m.dataset.ui = "menubar-menu";
      const api = dropdown(m, { onArrowOut: () => move(i, -1) }, "menubar-menu");
      api.trigger?.setAttribute("role", "menuitem"); api.trigger.tabIndex = i === 0 ? 0 : -1;
      apis.push(api);
      m.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" && !e.target.closest('[data-ui-part="sub-trigger"]')) { e.preventDefault(); move(i, 1); }
        if (e.target === api.trigger && e.key === "ArrowLeft") { e.preventDefault(); apis[(i - 1 + apis.length) % apis.length].trigger.focus(); }
        if (e.target === api.trigger && e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); apis[(i + 1) % apis.length].trigger.focus(); }
      });
      // hover switches menus while one is open
      api.trigger.addEventListener("pointerenter", () => { if (apis.some((a) => a.open) && !api.open) { apis.forEach((a) => a.hide()); api.show(); } });
    });
    return { menus: apis, destroy() { apis.forEach((a) => a.destroy()); } };
  });
}

export function createNavigationMenu(root, o = {}) {
  return once(root, "__uiNavigationMenu", () => {
    const b = bag(), hover = root.dataset.openOn !== "click";
    const menus = [...root.querySelectorAll('[data-ui-part="menu"]')];
    let cur = null, t;
    const items = menus.map((m, i) => {
      const tr = m.querySelector('[data-ui-part="trigger"]'), c = m.querySelector('[data-ui-part="content"]');
      if (!tr) return null; btn(tr);
      if (c) { c.id ||= `${root.id || "ui-nav"}-${i}`; tr.setAttribute("aria-controls", c.id); tr.setAttribute("aria-expanded", "false"); c.hidden = true; }
      return { m, tr, c };
    }).filter(Boolean);
    const set = (it) => {
      clearTimeout(t); if (cur === it) return;
      for (const x of items) { const on = x === it; if (!x.c) continue; x.c.hidden = !on; x.tr.setAttribute("aria-expanded", String(on)); [x.m, x.tr, x.c].forEach((e) => setState(e, on ? "open" : "closed")); }
      cur = it; root.dataset.state = it ? "open" : "closed"; emit(root, it ? "open" : "close", { index: items.indexOf(it) });
    };
    items.forEach((it, i) => {
      b.on(it.tr, "click", () => set(cur === it ? null : it));
      if (hover) { b.on(it.m, "pointerenter", () => { clearTimeout(t); t = setTimeout(() => set(it), cur ? 0 : 150); }); b.on(it.m, "pointerleave", () => { clearTimeout(t); t = setTimeout(() => set(null), 300); }); }
      b.on(it.tr, "keydown", (e) => {
        const n = roving(items.map((x) => x.tr), it.tr, e.key, { orientation: "horizontal" });
        if (n) { e.preventDefault(); n.focus(); }
        if (e.key === "ArrowDown" && it.c) { e.preventDefault(); set(it); it.c.querySelector("a,button")?.focus(); }
      });
    });
    b.on(root.ownerDocument, "keydown", (e) => { if (e.key === "Escape" && cur) { const tr = cur.tr; set(null); tr.focus(); } });
    b.on(root.ownerDocument, "pointerdown", (e) => { if (cur && !root.contains(e.target)) set(null); });
    return { close: () => set(null), destroy: b.off };
  });
}
