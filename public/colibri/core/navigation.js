// Colibri UI navigation primitives: Pagination, Stepper, Scrollspy, ScrollTo, Sticky, Sidebar.
import { uid, parts, part, emit, setState, btn, once, bag, isDisabled } from "./util.js";

/* Pagination (shadcn/Metronic): generates page items with ellipsis; links (href template) or buttons (ui:change).
   <nav data-ui="pagination" data-total="42" data-page="3" [data-siblings="1"] [data-href="?page={page}"] aria-label="Pagination"></nav> */
export function createPagination(root, o = {}) {
  return once(root, "__uiPagination", () => {
    const b = bag(), doc = root.ownerDocument;
    let total = Number(o.total ?? root.dataset.total ?? 1), page = Number(o.page ?? root.dataset.page ?? 1);
    const sib = Number(root.dataset.siblings ?? 1), href = root.dataset.href;
    const L = { prev: root.dataset.labelPrev || "Previous", next: root.dataset.labelNext || "Next" };
    if (root.tagName !== "NAV") root.setAttribute("role", "navigation");
    root.setAttribute("aria-label", root.getAttribute("aria-label") || "Pagination");
    const range = () => {
      const out = [1], s = Math.max(2, page - sib), e = Math.min(total - 1, page + sib);
      if (s > 2) out.push("…"); for (let i = s; i <= e; i++) out.push(i); if (e < total - 1) out.push("…"); if (total > 1) out.push(total); return out;
    };
    const el = (p, text, extra = "") => {
      const item = doc.createElement(href ? "a" : "button");
      item.dataset.uiPart = extra || "item"; item.dataset.page = p; item.textContent = text;
      if (href) {
        const target = href.replace("{page}", p);
        try { if (["http:", "https:"].includes(new URL(target, doc.baseURI).protocol)) item.setAttribute("href", target); } catch {}
      } else item.type = "button";
      if (p === page && !extra) { item.setAttribute("aria-current", "page"); item.dataset.state = "active"; }
      return item;
    };
    const render = () => {
      const list = doc.createElement("ul"); list.dataset.uiPart = "list";
      const append = item => { const li = doc.createElement("li"); li.append(item); list.append(li); };
      append(el(Math.max(1, page - 1), L.prev, "prev"));
      for (const p of range()) {
        if (p !== "…") append(el(p, p));
        else { const gap = doc.createElement("span"); gap.dataset.uiPart = "ellipsis"; gap.setAttribute("aria-hidden", "true"); gap.textContent = "…"; append(gap); }
      }
      append(el(Math.min(total, page + 1), L.next, "next"));
      root.replaceChildren(list);
      const pv = part(root, "prev") || root.querySelector('[data-ui-part="prev"]'), nx = root.querySelector('[data-ui-part="next"]');
      [[pv, page <= 1], [nx, page >= total]].forEach(([x, d]) => { if (!x || !d) return; x.setAttribute("aria-disabled", "true"); x.dataset.disabled = ""; if (x.tagName === "BUTTON") x.disabled = true; else x.removeAttribute("href"); });
      root.dataset.page = page;
    };
    const go = (p) => { p = Math.min(total, Math.max(1, p)); if (p === page) return; page = p; render(); o.onPageChange?.(p); emit(root, "change", { page: p }); root.querySelector('[aria-current="page"]')?.focus(); };
    if (!href) b.on(root, "click", (e) => { const x = e.target.closest("[data-page]"); if (x && !isDisabled(x)) go(Number(x.dataset.page)); });
    render();
    return { get page() { return page; }, set page(p) { go(p); }, setTotal(t) { total = t; page = Math.min(page, t); render(); }, destroy: b.off };
  });
}

/* Stepper (Metronic Stepper): wizard with linear validation.
   <div data-ui="stepper" [data-linear]>
     <ol data-ui-part="list"><li data-ui-part="step">Account</li>…</ol>
     <section data-ui-part="panel">…</section>… <button data-ui-part="prev">Back</button><button data-ui-part="next">Next</button>
     <button data-ui-part="finish">Finish</button></div>
   Cancel ui:beforechange to block (e.g. validation). With data-linear, native form validity in the current panel is checked. */
export function createStepper(root, o = {}) {
  return once(root, "__uiStepper", () => {
    const b = bag(), steps = () => parts(root, "step"), panels = () => parts(root, "panel");
    const linear = root.hasAttribute("data-linear"); let i = Number(root.dataset.step ?? 0);
    [part(root, "prev"), part(root, "next"), part(root, "finish")].forEach(btn);
    const render = () => {
      steps().forEach((s, k) => { setState(s, k < i ? "completed" : k === i ? "active" : "pending"); if (k === i) s.setAttribute("aria-current", "step"); else s.removeAttribute("aria-current"); });
      panels().forEach((p, k) => { p.hidden = k !== i; setState(p, k === i ? "active" : "inactive"); });
      const n = panels().length; const pv = part(root, "prev"), nx = part(root, "next"), fin = part(root, "finish");
      if (pv) pv.disabled = i === 0; if (nx) nx.hidden = i === n - 1; if (fin) fin.hidden = i !== n - 1;
      root.dataset.step = i; root.dataset.state = i === n - 1 ? "last" : i === 0 ? "first" : "middle";
    };
    const valid = () => { if (!linear) return true; const fs = [...panels()[i].querySelectorAll("input,select,textarea")]; const bad = fs.find((f) => !f.checkValidity()); if (bad) { bad.reportValidity?.(); return false; } return true; };
    const go = (to) => {
      if (to < 0 || to >= panels().length || to === i) return false;
      if (to > i && !valid()) return false;
      if (!emit(root, "beforechange", { from: i, to }, true)) return false;
      const from = i; i = to; render(); o.onStepChange?.(i); emit(root, "change", { from, to: i });
      (panels()[i].querySelector("[autofocus],input,select,textarea,button") || panels()[i]).focus?.(); return true;
    };
    b.on(root, "click", (e) => {
      if (e.target.closest('[data-ui-part="next"]')) go(i + 1);
      else if (e.target.closest('[data-ui-part="prev"]')) go(i - 1);
      else if (e.target.closest('[data-ui-part="finish"]')) { if (valid()) emit(root, "finish", { step: i }); }
      else { const s = e.target.closest('[data-ui-part="step"]'); if (s && root.dataset.clickable != null) { const k = steps().indexOf(s); if (!linear || k < i) go(k); } }
    });
    render();
    return { get step() { return i; }, next: () => go(i + 1), prev: () => go(i - 1), goTo: go, destroy: b.off };
  });
}

/* Scrollspy (Metronic): highlights nav links for sections in view.
   <nav data-ui="scrollspy" [data-target="#scrollable"] [data-offset="80"]><a data-ui-part="link" href="#sec1">…</a>…</nav> */
export function createScrollspy(root, o = {}) {
  return once(root, "__uiScrollspy", () => {
    const doc = root.ownerDocument, links = [...root.querySelectorAll('[data-ui-part="link"]')].filter((l) => l.closest("[data-ui=scrollspy]") === root); // links may sit inside nested collapsibles/accordions
    const container = root.dataset.target ? doc.querySelector(root.dataset.target) : null;
    const offset = Number(root.dataset.offset ?? 0);
    const targets = links.map((l) => doc.getElementById(decodeURIComponent((l.getAttribute("href") || "").slice(1)))).filter(Boolean);
    let active = null;
    const setActive = (t) => {
      if (t === active) return false; active = t;
      links.forEach((l) => { const on = t && l.getAttribute("href") === `#${t.id}`; setState(l, on ? "active" : "inactive"); on ? l.setAttribute("aria-current", "location") : l.removeAttribute("aria-current"); });
      emit(root, "change", { id: t?.id ?? null }); return true;
    };
    // Auto-scroll the nav ONLY when the active section changes, and never while the user is scrolling the nav itself
    // (otherwise scrolling the sidebar to the end and chaining into the page snaps it back to the active link).
    const navBox = root.closest("[data-ui=sidebar]") || root.parentElement;
    let userOwned = false, selfScroll = false; // once the user scrolls the nav, stop following until they click a link
    const markUser = (e) => { if (e?.type === "pointerdown" && e.target.closest?.("a[href^='#']")) { userOwned = false; return; } userOwned = true; };
    const navScroll = () => { if (selfScroll) { selfScroll = false; return; } markUser(); };
    navBox?.addEventListener("wheel", markUser, { passive: true }); navBox?.addEventListener("touchstart", markUser, { passive: true });
    navBox?.addEventListener("click", (e) => { if (e.target.closest?.("a[href^='#']")) userOwned = false; }); navBox?.addEventListener("scroll", navScroll, { passive: true });
    // Active = last section whose top has crossed the offset line (robust for tall sections, unlike "first visible").
    const view = doc.defaultView, scroller = container || view;
    const compute = () => {
      const top = container ? container.getBoundingClientRect().top : 0;
      const line = top + offset + 1;
      const atEnd = container ? container.scrollTop + container.clientHeight >= container.scrollHeight - 2 : view.innerHeight + view.scrollY >= doc.documentElement.scrollHeight - 2;
      let cur = null;
      for (const t of targets) { if (t.offsetParent === null && t.getClientRects().length === 0) continue; if (t.getBoundingClientRect().top <= line) cur = t; }
      if (atEnd) cur = targets.filter((t) => t.getClientRects().length).at(-1) || cur;
      const changed = setActive(cur || targets[0] || null);
      if (changed && cur && root.dataset.autoScroll !== "false" && !userOwned) { const l = links.find((x) => x.getAttribute("href") === `#${cur.id}`); const box = navBox; if (l && box && box.scrollHeight > box.clientHeight) { const lr = l.getBoundingClientRect(), br = box.getBoundingClientRect(); if (lr.top < br.top + 40 || lr.bottom > br.bottom - 40) { selfScroll = true; box.scrollTop += lr.top - br.top - box.clientHeight / 2; } } }
    };
    let raf = 0; const onScroll = () => { if (!raf) raf = view.requestAnimationFrame(() => { raf = 0; compute(); }); };
    scroller.addEventListener("scroll", onScroll, { passive: true }); view.addEventListener("resize", onScroll);
    compute();
    const io = { disconnect() { scroller.removeEventListener("scroll", onScroll); view.removeEventListener("resize", onScroll);
      navBox?.removeEventListener("wheel", markUser); navBox?.removeEventListener("touchstart", markUser);  navBox?.removeEventListener("scroll", navScroll); } };
    return { get active() { return active?.id ?? null; }, refresh: compute, destroy() { io.disconnect(); } };
  });
}

/* ScrollTo (Metronic): <a data-ui="scrollto" href="#id" [data-offset="64"] [data-target="#container"]>  smooth + focus target */
export function createScrollTo(root) {
  return once(root, "__uiScrollTo", () => {
    const b = bag(), doc = root.ownerDocument;
    b.on(root, "click", (e) => {
      const sel = root.dataset.scrollto || root.getAttribute("href"); const t = sel && sel.startsWith("#") ? doc.getElementById(sel.slice(1)) : null; if (!t) return;
      e.preventDefault(); const c = root.dataset.target ? doc.querySelector(root.dataset.target) : null; const off = Number(root.dataset.offset ?? 0);
      const smooth = !doc.defaultView.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (c) c.scrollTo({ top: t.offsetTop - off, behavior: smooth ? "smooth" : "auto" });
      else doc.defaultView.scrollTo({ top: t.getBoundingClientRect().top + doc.defaultView.scrollY - off, behavior: smooth ? "smooth" : "auto" });
      if (!t.hasAttribute("tabindex")) t.tabIndex = -1; t.focus({ preventScroll: true }); history.replaceState?.(null, "", `#${t.id}`); emit(root, "scroll", { id: t.id });
    });
    return { destroy: b.off };
  });
}

/* Sticky (Metronic): toggles data-state="stuck" when a position:sticky element sticks (CSS does the sticking).
   <header data-ui="sticky" [data-top="0"]>…</header>  →  set your own CSS: [data-ui=sticky]{position:sticky;top:0} */
export function createSticky(root) {
  return once(root, "__uiSticky", () => {
    const doc = root.ownerDocument, s = doc.createElement("div"); s.dataset.uiPart = "sentinel"; s.style.cssText = "height:1px;margin-bottom:-1px;visibility:hidden"; root.before(s);
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { const stuck = !e.isIntersecting; setState(root, stuck ? "stuck" : "static"); emit(root, "change", { stuck }); }, { rootMargin: `-${Number(root.dataset.top ?? 0) + 1}px 0px 0px 0px` }) : null;
    io?.observe(s); setState(root, "static");
    return { destroy() { io?.disconnect(); s.remove(); } };
  });
}

/* Sidebar (shadcn Sidebar, Metronic layout sidebar): expanded/collapsed (desktop) + open/closed (mobile), persisted.
   <aside data-ui="sidebar" data-collapsible="icon|offcanvas|none" [data-storage-key="colibri.sidebar"] [data-breakpoint="1024"]>…</aside>
   <button data-ui-sidebar-toggle="#id"> anywhere; Ctrl/Cmd+B toggles. Groups: data-ui-part="group" with nested collapsible. */
export function createSidebar(root, o = {}) {
  return once(root, "__uiSidebar", () => {
    const b = bag(), doc = root.ownerDocument, win = doc.defaultView, key = root.dataset.storageKey || "colibri.sidebar";
    root.id ||= uid("ui-sidebar"); const bp = Number(root.dataset.breakpoint ?? 1024);
    let collapsed = (() => { try { return localStorage.getItem(key) === "collapsed"; } catch { return false; } })(), mobileOpen = false;
    const mobile = () => win.innerWidth < bp;
    const toggles = () => [...doc.querySelectorAll(`[data-ui-sidebar-toggle="#${root.id}"]`)];
    const render = () => {
      root.dataset.state = mobile() ? (mobileOpen ? "open" : "closed") : (collapsed ? "collapsed" : "expanded");
      root.dataset.mobile = String(mobile());
      toggles().forEach((t) => { btn(t); t.setAttribute("aria-controls", root.id); t.setAttribute("aria-expanded", String(mobile() ? mobileOpen : !collapsed)); });
    };
    const toggle = () => { if (mobile()) mobileOpen = !mobileOpen; else { collapsed = !collapsed; try { localStorage.setItem(key, collapsed ? "collapsed" : "expanded"); } catch {} } render(); emit(root, "change", { state: root.dataset.state }); };
    b.on(doc, "click", (e) => { if (e.target.closest(`[data-ui-sidebar-toggle="#${root.id}"]`)) toggle(); else if (mobile() && mobileOpen && !root.contains(e.target)) { mobileOpen = false; render(); } });
    b.on(doc, "keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && root.dataset.shortcut !== "false") { e.preventDefault(); toggle(); } if (e.key === "Escape" && mobile() && mobileOpen) { mobileOpen = false; render(); } });
    b.on(win, "resize", render); render();
    return { toggle, get state() { return root.dataset.state; }, destroy: b.off };
  });
}
