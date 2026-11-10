// Colibri UI base primitives.
import { uid, parts, part, emit, setState, btn, once, bag, isDisabled, roving, owner } from "./util.js";

/* Dismiss / Alert (Metronic Dismiss, shadcn Alert): <div data-ui="dismiss" role="alert|status">… <button data-ui-part="close" aria-label="Close">×</button></div>
   Cancel ui:beforedismiss to veto. data-remove="false" keeps node (hidden) instead of removing. */
export function createDismiss(root) {
  return once(root, "__uiDismiss", () => {
    const b = bag();
    b.on(root, "click", (e) => {
      const c = e.target.closest('[data-ui-part="close"]'); if (!c || owner(c) !== root) return;
      if (!emit(root, "beforedismiss", {}, true)) return;
      setState(root, "closed"); emit(root, "dismiss", {});
      if (root.dataset.remove === "false") root.hidden = true; else root.remove();
    });
    parts(root, "close").forEach(btn); setState(root, "open");
    return { destroy: b.off };
  });
}

/* Toast / Sonner: a region + imperative API. No markup required.
   <ol data-ui="toaster" data-position="bottom-right" data-max="3" aria-label="Notifications"></ol>
   toast({title, description, variant:"default|success|error|warning|info|loading", duration:4000, action:{label,onClick}, id})
   → returns id; toast.dismiss(id); toast.update(id, opts); toast.promise(p, {loading,success,error}).
   Each toast: <li data-ui-part="toast" data-variant data-state="open|closing"> title/description/action/close parts. Pauses on hover/focus. */
let defaultToaster = null;
export function createToaster(root) {
  return once(root, "__uiToaster", () => {
    const doc = root.ownerDocument, max = Number(root.dataset.max ?? 3); defaultToaster = root;
    root.setAttribute("role", "region"); root.setAttribute("aria-label", root.getAttribute("aria-label") || "Notifications"); root.tabIndex = -1;
    const live = { polite: mk("polite"), assertive: mk("assertive") };
    function mk(p) { const r = doc.createElement("div"); r.setAttribute("aria-live", p); r.setAttribute("aria-atomic", "true"); r.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"; root.after(r); return r; }
    const map = new Map();
    function dismiss(id) {
      const t = map.get(id); if (!t) return; clearTimeout(t.timer); map.delete(id);
      setState(t.el, "closing"); emit(root, "toast-close", { id });
      const done = () => t.el.remove(); const dur = parseFloat(getComputedStyle(t.el).transitionDuration || "0") * 1000 || parseFloat(getComputedStyle(t.el).animationDuration || "0") * 1000;
      dur ? setTimeout(done, dur) : done();
    }
    function arm(t) { clearTimeout(t.timer); if (t.o.duration !== Infinity && t.o.variant !== "loading") { t.start = Date.now(); t.timer = setTimeout(() => dismiss(t.id), t.left ?? t.o.duration); } }
    function fill(t) {
      const { el, o } = t; el.dataset.variant = o.variant || "default";
      el.innerHTML = `<div data-ui-part="title"></div>${o.description ? '<div data-ui-part="description"></div>' : ""}${o.action ? '<button type="button" data-ui-part="action"></button>' : ""}${o.dismissible === false ? "" : '<button type="button" data-ui-part="close" aria-label="Close">×</button>'}`;
      el.querySelector('[data-ui-part="title"]').textContent = o.title || "";
      if (o.description) el.querySelector('[data-ui-part="description"]').textContent = o.description;
      if (o.action) el.querySelector('[data-ui-part="action"]').textContent = o.action.label;
      (["error", "warning"].includes(o.variant) ? live.assertive : live.polite).textContent = `${o.title || ""} ${o.description || ""}`;
    }
    function show(o) {
      o = { duration: 4000, ...(typeof o === "string" ? { title: o } : o) };
      const id = o.id ?? uid("toast"); if (map.has(id)) return update(id, o);
      const el = doc.createElement("li"); el.dataset.uiPart = "toast"; el.dataset.id = id;
      const t = { id, el, o }; map.set(id, t); fill(t);
      el.addEventListener("click", (e) => { if (e.target.closest('[data-ui-part="close"]')) dismiss(id); else if (e.target.closest('[data-ui-part="action"]')) { o.action.onClick?.(); dismiss(id); } });
      const pause = () => { clearTimeout(t.timer); if (t.start) t.left = Math.max(0, (t.left ?? t.o.duration) - (Date.now() - t.start)); }, resume = () => arm(t);
      el.addEventListener("pointerenter", pause); el.addEventListener("pointerleave", resume); el.addEventListener("focusin", pause); el.addEventListener("focusout", resume);
      const pos = root.dataset.position || "bottom-right"; pos.startsWith("top") ? root.prepend(el) : root.append(el);
      requestAnimationFrame(() => setState(el, "open")); arm(t);
      const extra = [...map.values()].slice(0, Math.max(0, map.size - max)); extra.forEach((x) => dismiss(x.id));
      emit(root, "toast-open", { id }); return id;
    }
    function update(id, o) { const t = map.get(id); if (!t) return show({ ...o, id }); t.o = { ...t.o, ...o }; t.left = undefined; fill(t); arm(t); return id; }
    const api = Object.assign(show, { dismiss, update, clear: () => [...map.keys()].forEach(dismiss),
      promise(p, m) { const id = show({ title: m.loading, variant: "loading", duration: Infinity }); p.then((v) => update(id, { title: typeof m.success === "function" ? m.success(v) : m.success, variant: "success", duration: 4000 }), (e) => update(id, { title: typeof m.error === "function" ? m.error(e) : m.error, variant: "error", duration: 6000 })); return p; },
      destroy() { api.clear(); live.polite.remove(); live.assertive.remove(); } });
    root.toast = api;
    return api;
  });
}
/** global helper: toast("Saved") — uses first [data-ui=toaster] (created on demand). */
function toaster() {
  let r = defaultToaster || document.querySelector('[data-ui="toaster"]');
  if (!r) { r = document.createElement("ol"); r.dataset.ui = "toaster"; document.body.append(r); }
  return createToaster(r);
}
export const toast = Object.assign((o) => toaster()(o), {
  dismiss: (id) => toaster().dismiss(id),
  update: (id, o) => toaster().update(id, o),
  promise: (p, m) => toaster().promise(p, m),
  clear: () => toaster().clear(),
});

/* Progress (shadcn/Metronic): <div data-ui="progress" data-value="40" [data-max="100"]> <div data-ui-part="indicator"></div></div>
   No value → indeterminate. Sets --ui-progress (0–100%) for CSS. */
export function createProgress(root, o = {}) {
  return once(root, "__uiProgress", () => {
    root.setAttribute("role", "progressbar"); const max = Number(root.dataset.max ?? 100);
    const set = (v) => {
      root.setAttribute("aria-valuemin", "0"); root.setAttribute("aria-valuemax", max);
      if (v == null || v === "" || isNaN(v)) { root.removeAttribute("aria-valuenow"); setState(root, "indeterminate"); root.style.removeProperty("--ui-progress"); return; }
      v = Math.min(max, Math.max(0, Number(v))); root.setAttribute("aria-valuenow", v); root.dataset.value = v;
      root.style.setProperty("--ui-progress", `${(v / max) * 100}%`); part(root, "indicator")?.style.setProperty("--ui-progress", `${(v / max) * 100}%`);
      setState(root, v >= max ? "complete" : "loading");
    };
    set(o.value ?? root.dataset.value);
    return { set value(v) { set(v); }, get value() { return Number(root.getAttribute("aria-valuenow")); }, destroy() {} };
  });
}

/* Carousel (shadcn/Metronic): scroll-snap based; CSS owns layout ([data-ui-part=viewport]{overflow-x:auto;scroll-snap-type:x mandatory}).
   <div data-ui="carousel" [data-loop] [data-autoplay="5000"] aria-label="Featured">
     <div data-ui-part="viewport"><div data-ui-part="slide">…</div>…</div>
     <button data-ui-part="prev">‹</button><button data-ui-part="next">›</button><div data-ui-part="dots"></div></div> */
export function createCarousel(root, o = {}) {
  return once(root, "__uiCarousel", () => {
    const b = bag(), vp = part(root, "viewport"), slides = () => parts(root, "slide"), dots = part(root, "dots");
    const loop = root.hasAttribute("data-loop"), auto = Number(root.dataset.autoplay || 0);
    root.setAttribute("role", "region"); root.setAttribute("aria-roledescription", "carousel");
    slides().forEach((s, i, a) => { s.setAttribute("role", "group"); s.setAttribute("aria-roledescription", "slide"); s.setAttribute("aria-label", `${i + 1} / ${a.length}`); });
    [part(root, "prev"), part(root, "next")].forEach(btn);
    if (dots) dots.innerHTML = slides().map((_, i) => `<button type="button" data-ui-part="dot" data-index="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("");
    let index = 0, timer;
    const render = () => {
      slides().forEach((s, i) => { setState(s, i === index ? "active" : "inactive"); s.toggleAttribute("inert", i !== index && root.dataset.inertInactive != null); });
      parts(root, "dot").forEach((d, i) => { setState(d, i === index ? "active" : "inactive"); d.setAttribute("aria-current", String(i === index)); });
      const pv = part(root, "prev"), nx = part(root, "next"); if (!loop) { if (pv) pv.disabled = index === 0; if (nx) nx.disabled = index === slides().length - 1; }
      root.dataset.index = index;
    };
    const go = (i, smooth = true) => {
      const n = slides().length; i = loop ? (i + n) % n : Math.max(0, Math.min(n - 1, i)); if (i === index && smooth) return;
      index = i; const s = slides()[i]; vp?.scrollTo?.({ left: s.offsetLeft - vp.offsetLeft, behavior: smooth ? "smooth" : "auto" }); render(); emit(root, "change", { index });
    };
    b.on(root, "click", (e) => { if (e.target.closest('[data-ui-part="prev"]')) go(index - 1); else if (e.target.closest('[data-ui-part="next"]')) go(index + 1); else { const d = e.target.closest('[data-ui-part="dot"]'); if (d) go(Number(d.dataset.index)); } });
    b.on(root, "keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); } });
    if (vp && typeof IntersectionObserver !== "undefined") { const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting && en.intersectionRatio > 0.6) { const i = slides().indexOf(en.target); if (i !== index) { index = i; render(); emit(root, "change", { index }); } } }), { root: vp, threshold: [0.6] }); slides().forEach((s) => io.observe(s)); b.on(root, "ui:destroy", () => io.disconnect()); }
    if (auto) { const play = () => { clearInterval(timer); timer = setInterval(() => go(index + 1), auto); }; const stop = () => clearInterval(timer); b.on(root, "pointerenter", stop); b.on(root, "pointerleave", play); b.on(root, "focusin", stop); b.on(root, "focusout", play); play(); }
    if (!root.hasAttribute("tabindex")) root.tabIndex = 0;
    render();
    return { get index() { return index; }, go, next: () => go(index + 1), prev: () => go(index - 1), destroy() { clearInterval(timer); b.off(); } };
  });
}

/* Avatar: image with fallback (initials) while loading/error. <span data-ui="avatar"><img data-ui-part="image" src alt><span data-ui-part="fallback">LD</span></span> */
export function createAvatar(root) {
  return once(root, "__uiAvatar", () => {
    const img = part(root, "image"), fb = part(root, "fallback");
    const set = (s) => { setState(root, s); if (img) img.hidden = s !== "loaded"; if (fb) fb.hidden = s === "loaded"; };
    if (!img || !img.getAttribute("src")) { set("error"); return { destroy() {} }; }
    if (img.complete && img.naturalWidth) set("loaded"); else { set("loading"); img.addEventListener("load", () => set("loaded"), { once: true }); img.addEventListener("error", () => set("error"), { once: true }); }
    return { destroy() {} };
  });
}

/* ThemeSwitch (Metronic theme-switch): light/dark/system on <html data-theme>, persisted + prefers-color-scheme.
   <button data-ui="theme-switch" [data-target="html"] [data-storage-key]>  cycles; or a select/radio-group with data-ui-theme-value. */
export function createThemeSwitch(root) {
  return once(root, "__uiThemeSwitch", () => {
    const b = bag(), doc = root.ownerDocument, key = root.dataset.storageKey || "colibri.theme", target = doc.querySelector(root.dataset.target || "html");
    const mq = doc.defaultView.matchMedia?.("(prefers-color-scheme: dark)");
    let mode = (() => { try { return localStorage.getItem(key) || "system"; } catch { return "system"; } })();
    const apply = () => { const eff = mode === "system" ? (mq?.matches ? "dark" : "light") : mode; target.dataset.theme = eff; target.style.colorScheme = eff; root.dataset.mode = mode; root.setAttribute("aria-label", root.getAttribute("aria-label") || "Toggle theme"); if (root.tagName === "BUTTON") root.setAttribute("aria-pressed", String(eff === "dark")); emit(root, "change", { mode, theme: eff }); };
    const set = (m) => { mode = m; try { localStorage.setItem(key, m); } catch {} apply(); };
    if (root.tagName === "BUTTON") { btn(root); b.on(root, "click", () => set({ light: "dark", dark: "system", system: "light" }[mode])); }
    else b.on(root, "change", (e) => { const v = e.target.value || e.detail?.value; if (v) set(v); });
    mq && b.on(mq, "change", () => mode === "system" && apply()); apply();
    return { get mode() { return mode; }, set mode(m) { set(m); }, destroy: b.off };
  });
}

/* DataTable (shadcn Data Table, Metronic Datatable): progressive enhancement of a server-rendered <table>.
   <div data-ui="datatable" data-page-size="10" [data-search="#q"]>
     <table><thead><tr><th data-ui-part="select-all"><input type=checkbox></th><th data-sort="name">Name</th><th data-sort="date" data-type="date">…</th>
     <tbody><tr data-ui-part="row" data-id="1"><td><input type=checkbox data-ui-part="row-select"></td><td>…</td>…
     <div data-ui-part="info"></div><nav data-ui="pagination"></nav></div>
   Features: sort (aria-sort, multi with Shift), filter (search input + api.filter(fn)), select all/indeterminate, client paging,
   column visibility api.setColumnVisible(i,bool). Remote mode (data-remote): emits ui:query {sort,page,search} instead. */
export function createDataTable(root, o = {}) {
  return once(root, "__uiDataTable", () => {
    const b = bag(), doc = root.ownerDocument, table = root.querySelector("table"); if (!table) throw new Error("datatable needs a <table>"); const tbody = table.tBodies[0] || table.appendChild(doc.createElement("tbody"));
    const remote = root.hasAttribute("data-remote"); let size = Number(root.dataset.pageSize || 0), page = 1, q = "", sort = [], pred = null;
    const all = () => [...tbody.rows];
    const ths = table.tHead?.rows[0] ? [...table.tHead.rows[0].cells] : [];
    ths.forEach((th, i) => { if (th.dataset.sort == null) return; th.setAttribute("aria-sort", "none"); th.tabIndex = 0; th.dataset.uiPart = "sort-header"; th.dataset.col = i; });
    const cellVal = (tr, i, type) => { const c = tr.cells[i]; const v = c?.dataset.value ?? c?.textContent.trim() ?? ""; return type === "number" ? parseFloat(v.replace(/[^\d.-]/g, "")) || 0 : type === "date" ? Date.parse(v) || 0 : v.toLocaleLowerCase(); };
    const selectAll = root.querySelector('[data-ui-part="select-all"] input'), info = part(root, "info"), pager = root.querySelector('[data-ui="pagination"]');
    const selected = () => all().filter((r) => r.querySelector('[data-ui-part="row-select"]')?.checked);
    function syncSelect() {
      all().forEach((r) => { const c = r.querySelector('[data-ui-part="row-select"]'); r.toggleAttribute("data-selected", !!c?.checked); c && r.setAttribute("aria-selected", String(c.checked)); });
      const vis = all().filter((r) => !r.hidden), on = vis.filter((r) => r.querySelector('[data-ui-part="row-select"]')?.checked).length;
      if (selectAll) { selectAll.checked = vis.length > 0 && on === vis.length; selectAll.indeterminate = on > 0 && on < vis.length; }
      root.dataset.selected = selected().length; emit(root, "select", { ids: selected().map((r) => r.dataset.id) });
    }
    function apply() {
      if (remote) { emit(root, "query", { sort, page, search: q, pageSize: size }); return; }
      let rows = all(); const s = q.toLowerCase();
      const match = rows.filter((r) => (!s || r.textContent.toLowerCase().includes(s)) && (!pred || pred(r)));
      if (sort.length) { const sorted = [...match].sort((a, c) => { for (const { col, dir, type } of sort) { const x = cellVal(a, col, type), y = cellVal(c, col, type); if (x < y) return dir === "asc" ? -1 : 1; if (x > y) return dir === "asc" ? 1 : -1; } return 0; }); sorted.forEach((r) => tbody.append(r)); rows.filter((r) => !match.includes(r)).forEach((r) => tbody.append(r)); }
      const pages = size ? Math.max(1, Math.ceil(match.length / size)) : 1; page = Math.min(page, pages);
      all().forEach((r) => (r.hidden = true)); const ordered = all().filter((r) => match.includes(r));
      ordered.forEach((r, i) => (r.hidden = size ? Math.floor(i / size) + 1 !== page : false));
      if (info) info.textContent = match.length ? `${size ? (page - 1) * size + 1 : 1}–${size ? Math.min(page * size, match.length) : match.length} / ${match.length}` : (root.dataset.emptyText || "0");
      const empty = part(root, "empty"); if (empty) empty.hidden = match.length > 0;
      if (pager) { const p = pager.__uiPagination; if (p) { p.setTotal(pages); } else { pager.dataset.total = pages; pager.dataset.page = page; } }
      root.dataset.count = match.length; syncSelect();
    }
    const toggleSort = (th, multi) => {
      const col = Number(th.dataset.col), type = th.dataset.type, cur = sort.find((x) => x.col === col);
      const dir = !cur ? "asc" : cur.dir === "asc" ? "desc" : null;
      sort = multi ? sort.filter((x) => x.col !== col) : []; if (dir) sort.push({ col, dir, type, key: th.dataset.sort });
      ths.forEach((h) => { if (h.dataset.sort == null) return; const s = sort.find((x) => x.col === Number(h.dataset.col)); h.setAttribute("aria-sort", s ? (s.dir === "asc" ? "ascending" : "descending") : "none"); setState(h, s ? s.dir : "none"); });
      page = 1; apply(); emit(root, "sort", { sort: sort.map(({ key, dir }) => ({ key, dir })) });
    };
    table.tHead && b.on(table.tHead, "click", (e) => { const th = e.target.closest('[data-ui-part="sort-header"]'); if (th && !e.target.closest("input")) toggleSort(th, e.shiftKey); });
    table.tHead && b.on(table.tHead, "keydown", (e) => { const th = e.target.closest('[data-ui-part="sort-header"]'); if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleSort(th, e.shiftKey); } });
    selectAll && b.on(selectAll, "change", () => { all().filter((r) => !r.hidden).forEach((r) => { const c = r.querySelector('[data-ui-part="row-select"]'); if (c) c.checked = selectAll.checked; }); syncSelect(); });
    b.on(tbody, "change", (e) => { if (e.target.closest('[data-ui-part="row-select"]')) syncSelect(); });
    const search = root.dataset.search ? doc.querySelector(root.dataset.search) : part(root, "search");
    search && b.on(search, "input", () => { q = search.value; page = 1; apply(); });
    pager && b.on(pager, "ui:change", (e) => { page = e.detail.page; apply(); });
    apply();
    return { get selected() { return selected().map((r) => r.dataset.id); }, filter(fn) { pred = fn; page = 1; apply(); }, setPageSize(n) { size = n; page = 1; apply(); },
      setColumnVisible(i, on) { table.querySelectorAll("tr").forEach((tr) => { if (tr.cells[i]) tr.cells[i].hidden = !on; }); }, refresh: apply, destroy: b.off };
  });
}

/* Resizable (shadcn Resizable): panel group with keyboard-accessible separators.
   <div data-ui="resizable" data-direction="horizontal" [data-storage-key]><div data-ui-part="panel" data-size="30" data-min="10"></div>
     <div data-ui-part="handle"></div><div data-ui-part="panel" data-size="70"></div></div>   (sets flex-basis %) */
export function createResizable(root) {
  return once(root, "__uiResizable", () => {
    const b = bag(), vertical = root.dataset.direction === "vertical", key = root.dataset.storageKey;
    const panels = parts(root, "panel"), handles = parts(root, "handle");
    let sizes = panels.map((p) => Number(p.dataset.size) || 100 / panels.length);
    try { const s = key && JSON.parse(localStorage.getItem(key)); if (Array.isArray(s) && s.length === sizes.length) sizes = s; } catch {}
    const render = () => { panels.forEach((p, i) => { p.style.flex = `${sizes[i]} 1 0`; p.dataset.size = sizes[i].toFixed(1); }); handles.forEach((h, i) => { h.setAttribute("aria-valuenow", Math.round(sizes[i])); }); };
    const resize = (i, delta) => { const a = panels[i], c = panels[i + 1]; const minA = Number(a.dataset.min ?? 5), minC = Number(c.dataset.min ?? 5); let x = Math.max(minA - sizes[i], Math.min(delta, sizes[i + 1] - minC)); sizes[i] += x; sizes[i + 1] -= x; render(); try { key && localStorage.setItem(key, JSON.stringify(sizes)); } catch {} emit(root, "resize", { sizes: [...sizes] }); };
    handles.forEach((h, i) => {
      h.setAttribute("role", "separator"); h.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical"); h.tabIndex = 0; h.setAttribute("aria-valuemin", "0"); h.setAttribute("aria-valuemax", "100");
      panels[i].id ||= uid("ui-panel"); h.setAttribute("aria-controls", panels[i].id);
      b.on(h, "keydown", (e) => { const s = e.shiftKey ? 10 : 2; const m = vertical ? { ArrowUp: -s, ArrowDown: s } : { ArrowLeft: -s, ArrowRight: s }; if (e.key in m) { e.preventDefault(); resize(i, m[e.key]); } if (e.key === "Home") resize(i, -100); if (e.key === "End") resize(i, 100); });
      b.on(h, "pointerdown", (e) => {
        e.preventDefault(); h.setPointerCapture?.(e.pointerId); setState(h, "dragging"); const r = root.getBoundingClientRect(); let last = vertical ? e.clientY : e.clientX;
        const mv = (ev) => { const cur = vertical ? ev.clientY : ev.clientX; resize(i, ((cur - last) / (vertical ? r.height : r.width)) * 100); last = cur; };
        const up = () => { setState(h, "idle"); h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); };
        h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up);
      });
    });
    root.style.display ||= "flex"; root.style.flexDirection ||= vertical ? "column" : "row"; render();
    return { get sizes() { return [...sizes]; }, destroy: b.off };
  });
}

/* Reparent (Metronic): move an element between containers by media query (e.g. sidebar into drawer on mobile).
   <div data-ui="reparent" data-mode="prepend|append" data-target="#desktop-slot" data-target-mobile="#drawer-body" data-media="(max-width: 1023px)"> */
export function createReparent(root) {
  return once(root, "__uiReparent", () => {
    const doc = root.ownerDocument, mq = doc.defaultView.matchMedia?.(root.dataset.media || "(max-width: 1023px)");
    const go = () => { const t = doc.querySelector(mq?.matches ? root.dataset.targetMobile : root.dataset.target); if (t && root.parentElement !== t) { root.dataset.mode === "prepend" ? t.prepend(root) : t.append(root); emit(root, "reparent", { mobile: !!mq?.matches }); } };
    mq?.addEventListener?.("change", go); go();
    return { destroy() { mq?.removeEventListener?.("change", go); } };
  });
}

/* ScrollArea / Scrollable (shadcn ScrollArea, Metronic Scrollable): native scroll + state for edge shadows.
   <div data-ui="scroll-area" [data-max-height="300px"]>…</div> → data-scroll-top/bottom/left/right booleans; keyboard focusable. */
export function createScrollArea(root) {
  return once(root, "__uiScrollArea", () => {
    const b = bag(); if (root.dataset.maxHeight) { root.style.maxHeight = root.dataset.maxHeight; root.style.overflow = "auto"; }
    if (!root.hasAttribute("tabindex")) root.tabIndex = 0; root.setAttribute("role", root.getAttribute("role") || "region");
    const upd = () => { const { scrollTop: t, scrollHeight: h, clientHeight: c, scrollLeft: l, scrollWidth: w, clientWidth: cw } = root; root.toggleAttribute("data-scroll-top", t > 0); root.toggleAttribute("data-scroll-bottom", t + c < h - 1); root.toggleAttribute("data-scroll-left", l > 0); root.toggleAttribute("data-scroll-right", l + cw < w - 1); };
    b.on(root, "scroll", upd, { passive: true }); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null; ro?.observe(root); upd();
    return { update: upd, destroy() { b.off(); ro?.disconnect(); } };
  });
}

/* MessageScroller (shadcn): chat-style list that sticks to bottom unless the user scrolled up; "jump to latest" button.
   <div data-ui="message-scroller"><div data-ui-part="viewport">…messages…</div><button data-ui-part="jump" hidden>↓ New</button></div> */
export function createMessageScroller(root) {
  return once(root, "__uiMessageScroller", () => {
    const b = bag(), vp = part(root, "viewport") || root, jump = btn(part(root, "jump"));
    vp.setAttribute("role", vp.getAttribute("role") || "log"); vp.setAttribute("aria-live", "polite");
    let stick = true; const atBottom = () => vp.scrollHeight - vp.scrollTop - vp.clientHeight < 8;
    const toBottom = (smooth) => vp.scrollTo?.({ top: vp.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    b.on(vp, "scroll", () => { stick = atBottom(); if (jump) jump.hidden = stick; setState(root, stick ? "pinned" : "scrolled"); }, { passive: true });
    jump && b.on(jump, "click", () => toBottom(true));
    const mo = new MutationObserver(() => { if (stick) toBottom(false); else if (jump) jump.hidden = false; }); mo.observe(vp, { childList: true, subtree: true });
    toBottom(false); return { scrollToBottom: toBottom, destroy() { b.off(); mo.disconnect(); } };
  });
}

/* Clipboard / CodeBlock copy (shadcn Code Block, Metronic Clipboard plugin):
   <button data-ui="clipboard" data-target="#code" | data-text="…">Copy</button> → data-state="copied" for 2s */
export function createClipboard(root) {
  return once(root, "__uiClipboard", () => {
    const b = bag(), doc = root.ownerDocument; btn(root);
    b.on(root, "click", async () => {
      const t = root.dataset.text ?? (root.dataset.target ? (doc.querySelector(root.dataset.target)?.value ?? doc.querySelector(root.dataset.target)?.textContent) : "");
      try { await navigator.clipboard.writeText(t); setState(root, "copied"); emit(root, "copy", { text: t }); } catch (e) { setState(root, "error"); emit(root, "copy-error", { error: e }); }
      setTimeout(() => setState(root, "idle"), Number(root.dataset.resetMs ?? 2000));
    });
    setState(root, "idle"); return { destroy: b.off };
  });
}

/* Button (shadcn/Metronic Button): native <button>; adds loading state helper.
   <button data-ui="button" [data-loading]>  api.loading = true → aria-busy, disabled, data-state="loading" */
export function createButton(root) {
  return once(root, "__uiButton", () => {
    btn(root);
    const set = (on) => { root.toggleAttribute("data-loading", on); root.setAttribute("aria-busy", String(on)); if (on) { root.dataset.wasDisabled = root.disabled; root.disabled = true; } else if (root.dataset.wasDisabled != null) { root.disabled = root.dataset.wasDisabled === "true"; delete root.dataset.wasDisabled; } setState(root, on ? "loading" : "idle"); };
    set(root.hasAttribute("data-loading"));
    return { get loading() { return root.hasAttribute("data-loading"); }, set loading(v) { set(!!v); }, destroy() {} };
  });
}

/* Separator: <hr data-ui="separator"> or <div data-ui="separator" data-orientation="vertical" [data-decorative]> */
export function createSeparator(root) {
  return once(root, "__uiSeparator", () => {
    if (root.hasAttribute("data-decorative")) root.setAttribute("role", "none");
    else { root.setAttribute("role", "separator"); root.setAttribute("aria-orientation", root.dataset.orientation || "horizontal"); }
    return { destroy() {} };
  });
}

/* Item / ItemGroup (shadcn Item): list rows with media, content and actions.
   <div data-ui="item-group" aria-label="Settings">
     <div data-ui-part="item" [data-href="/x" | contains <a data-ui-part="title-link">]>
       <span data-ui-part="media">🔔</span>
       <div data-ui-part="content"><div data-ui-part="title">Title</div><div data-ui-part="description">Sub</div></div>
       <div data-ui-part="actions">…controls…</div></div>…</div>
   role=list/listitem. Rows are tabbable via roving focus (one tab stop, ↑/↓/Home/End);
   Enter on a row (or click on a non-control area) activates its link / data-href and emits ui:activate.
   Focus inside a row's actions with Tab / → ; ← / Esc returns to the row. */
export function createItemGroup(root, o = {}) {
  return once(root, "__uiItemGroup", () => {
    const b = bag(); root.setAttribute("role", "list");
    const rowsOf = () => [...root.querySelectorAll('[data-ui-part="item"]')].filter((i) => i.parentElement.closest('[data-ui="item-group"]') === root);
    const items = () => rowsOf().filter((i) => !isDisabled(i));
    const CONTROL = "a,button,input,select,textarea,[role=switch],[role=checkbox],[tabindex]:not([data-ui-part=item])";
    const setup = () => {
      const all = rowsOf(); let active = all.find((i) => i.tabIndex === 0 && !isDisabled(i)) || items()[0];
      all.forEach((i) => {
        i.setAttribute("role", "listitem");
        const t = i.querySelector('[data-ui-part="title"]'); if (t) { t.id ||= uid("item-t"); i.setAttribute("aria-labelledby", t.id); }
        const d = i.querySelector('[data-ui-part="description"]'); if (d) { d.id ||= uid("item-d"); i.setAttribute("aria-describedby", d.id); }
        if (isDisabled(i)) i.setAttribute("aria-disabled", "true");
        i.tabIndex = i === active ? 0 : -1;
        const link = i.querySelector('[data-ui-part="title-link"]');
        if (link || i.dataset.href) i.dataset.interactive = "";
        if (link) link.tabIndex = -1;
      });
    };
    const activate = (i) => {
      if (isDisabled(i)) return;
      if (!emit(i, "activate", { item: i, value: i.dataset.value }, true)) return;
      const link = i.querySelector('[data-ui-part="title-link"]');
      if (link) link.click(); else if (i.dataset.href) location.assign(i.dataset.href);
    };
    const focusRow = (i) => { rowsOf().forEach((x) => (x.tabIndex = x === i ? 0 : -1)); i.focus(); };
    b.on(root, "keydown", (e) => {
      const row = e.target.closest('[data-ui-part="item"]'); if (!row || !root.contains(row)) return;
      if (e.target === row) {
        const n = roving(items(), row, e.key, { orientation: "vertical", loop: false });
        if (n) { e.preventDefault(); focusRow(n); return; }
        if (e.key === "Enter" && row.dataset.interactive != null) { e.preventDefault(); activate(row); }
        if (e.key === "ArrowRight") { const c = row.querySelector(`[data-ui-part=actions] :is(${CONTROL})`); if (c) { e.preventDefault(); c.focus(); } }
      } else if (e.key === "Escape" || (e.key === "ArrowLeft" && !/INPUT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); focusRow(row); }
    });
    b.on(root, "click", (e) => {
      const row = e.target.closest('[data-ui-part="item"]'); if (!row || row.dataset.interactive == null) return;
      if (e.target.closest(CONTROL) && !e.target.closest('[data-ui-part="title-link"]')) return; // let controls work
      if (e.target.closest('[data-ui-part="title-link"]')) { if (!emit(row, "activate", { item: row, value: row.dataset.value }, true)) e.preventDefault(); return; }
      activate(row);
    });
    b.on(root, "focusin", (e) => { const row = e.target.closest('[data-ui-part="item"]'); if (row && root.contains(row)) rowsOf().forEach((x) => (x.tabIndex = x === row ? 0 : -1)); });
    setup();
    return { refresh: setup, focus: (i = 0) => focusRow(items()[i]), destroy: () => b.off() };
  });
}

/* Badge (shadcn Badge): presentational; optional remove button → ui:remove (cancellable), removes the badge.
   <span data-ui="badge" data-variant>Tag <button data-ui-part="remove" aria-label="Remove tag">×</button></span> */
export function createBadge(root) {
  return once(root, "__uiBadge", () => {
    const b = bag(); const rm = part(root, "remove"); btn(rm);
    if (rm && !rm.hasAttribute("aria-label")) rm.setAttribute("aria-label", `Remove ${root.textContent.replace("×", "").trim()}`);
    if (rm) b.on(rm, "click", () => { if (emit(root, "remove", { text: root.textContent.trim() }, true)) { const nx = root.nextElementSibling?.querySelector?.('[data-ui-part="remove"]'); root.remove(); nx?.focus(); } });
    return { destroy: () => b.off() };
  });
}
