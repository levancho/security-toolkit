// Colibri UI: conversation + AI elements (shadcn Bubble/Message/Marker/Trace/Questionnaire/Attachment/Spinner
// and AI Elements: chain-of-thought, task, plan, tool, reasoning, sources, subagent, stack-trace, test-results,
// terminal, checkpoint, confirmation, context, file-tree, prompt-input, queue, suggestion).
// Headless: JS sets roles, ARIA, data-state/data-status and emits ui:* events; CSS lives in the theme.
import { uid, parts, part, emit, setState, btn, once, bag } from "./util.js";

const setText = (el, v) => { if (el && el.textContent !== String(v)) el.textContent = v; };
const setData = (el, k, v) => { if (el && el.dataset[k] !== String(v)) el.dataset[k] = v; };
const copyText = async (txt, b) => { try { await navigator.clipboard.writeText(txt); } catch {} if (b) { b.dataset.copied = ""; setTimeout(() => delete b.dataset.copied, 1500); } };

/** Disclosure shared by every collapsible AI element: part trigger toggles part content. */
function disclosure(root, b, { defaultOpen = root.hasAttribute("data-default-open") } = {}) {
  const t = part(root, "trigger"), c = part(root, "content");
  let open = defaultOpen;
  const id = root.id || uid("ui-ai");
  const set = (v, why = "user") => {
    open = !!v; setState(root, open ? "open" : "closed");
    if (t) { t.setAttribute("aria-expanded", String(open)); setState(t, root.dataset.state); }
    if (c) { c.hidden = !open; setState(c, root.dataset.state); }
    emit(root, "openchange", { open, why });
  };
  if (t && c) { btn(t); c.id ||= `${id}-content`; t.setAttribute("aria-controls", c.id); b.on(t, "click", () => set(!open)); }
  set(open, "init");
  return { get open() { return open; }, set };
}
const STATUS = { pending: "Pending", running: "Running", streaming: "Thinking", done: "Done", completed: "Completed", error: "Error", approved: "Approved", rejected: "Rejected", skipped: "Skipped" };
function statusLabel(root) { const s = part(root, "status"); if (s && !s.dataset.fixed) setText(s, root.dataset.statusLabel || STATUS[root.dataset.status] || root.dataset.status || ""); }

// ---------- conversation primitives ----------
export function createBubble(root) {
  return once(root, "__uiBubble", () => {
    const b = bag();
    for (const r of parts(root, "reaction")) { btn(r); r.setAttribute("aria-pressed", r.getAttribute("aria-pressed") || "false");
      b.on(r, "click", () => { const on = r.getAttribute("aria-pressed") !== "true"; r.setAttribute("aria-pressed", String(on));
        const n = r.querySelector("[data-ui-part=count]"); if (n) n.textContent = Math.max(0, (+n.textContent || 0) + (on ? 1 : -1));
        emit(root, "react", { value: r.dataset.value || r.textContent.trim(), on }); }); }
    const tg = part(root, "toggle"), content = part(root, "content");
    if (tg && content) { btn(tg); content.id ||= uid("ui-bubble");
      tg.setAttribute("aria-controls", content.id);
      const set = (x) => { root.dataset.expanded = String(x); tg.setAttribute("aria-expanded", String(x)); tg.textContent = x ? (tg.dataset.less || "Show less") : (tg.dataset.more || "Show more"); };
      set(false); b.on(tg, "click", () => set(root.dataset.expanded !== "true")); }
    return { destroy: b.off };
  });
}
export function createMessage(root) {
  return once(root, "__uiMessage", () => {
    const b = bag();
    root.setAttribute("role", root.getAttribute("role") || "article");
    root.dataset.from ||= "assistant";
    b.on(root, "click", (e) => {
      const a = e.target.closest("[data-ui-part=action]"); if (!a || a.closest("[data-ui=message]") !== root) return;
      const kind = a.dataset.action;
      if (kind === "copy") copyText((part(root, "content") || root).innerText.trim(), a);
      if (kind === "like" || kind === "dislike") { const on = a.getAttribute("aria-pressed") !== "true"; parts(root, "action").filter((x) => /like/.test(x.dataset.action)).forEach((x) => x.setAttribute("aria-pressed", "false")); a.setAttribute("aria-pressed", String(on)); }
      emit(root, "action", { action: kind });
    });
    parts(root, "action").forEach((a) => { btn(a); if (/like/.test(a.dataset.action)) a.setAttribute("aria-pressed", "false"); });
    return { destroy: b.off };
  });
}
export function createMarker(root) {
  return once(root, "__uiMarker", () => {
    if (root.dataset.variant === "separator") { root.setAttribute("role", "separator"); const c = part(root, "content"); if (c) root.setAttribute("aria-label", c.textContent.trim()); }
    else if (root.dataset.live != null) root.setAttribute("role", "status");
    parts(root, "icon").forEach((i) => i.setAttribute("aria-hidden", "true"));
    return { destroy() {} };
  });
}
export { createSpinner } from "./button-group.js";
export function createTrace(root) {
  return once(root, "__uiTrace", () => {
    root.setAttribute("role", "list");
    parts(root, "line").forEach((l) => { l.setAttribute("role", "listitem"); parts(l, "icon").forEach((i) => i.setAttribute("aria-hidden", "true")); });
    root.querySelectorAll("[data-ui-part=line] [data-ui-part=icon]").forEach((i) => i.setAttribute("aria-hidden", "true"));
    return { destroy() {} };
  });
}
export function createAttachment(root) {
  return once(root, "__uiAttachment", () => {
    const b = bag(), title = part(root, "title");
    root.setAttribute("role", root.getAttribute("role") || "group");
    if (title) { title.id ||= uid("ui-att"); root.setAttribute("aria-labelledby", title.id); }
    const sync = () => {
      const p = root.dataset.progress, bar = part(root, "progress");
      root.dataset.state = root.dataset.error != null ? "error" : p != null && +p < 100 ? "uploading" : "done";
      if (bar) { bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100"); bar.setAttribute("aria-valuenow", p ?? 100); bar.style.setProperty("--ui-value", `${p ?? 100}%`); bar.hidden = root.dataset.state !== "uploading"; }
    };
    const mo = new MutationObserver(sync); mo.observe(root, { attributes: true, attributeFilter: ["data-progress", "data-error"] }); sync();
    parts(root, "action").forEach(btn);
    b.on(root, "click", (e) => {
      const a = e.target.closest("[data-ui-part=action]"); if (!a) return;
      if (a.dataset.action === "remove") { if (!emit(root, "remove", { name: title?.textContent.trim() }, true)) return;
        const next = root.nextElementSibling?.querySelector("button") || root.previousElementSibling?.querySelector("button"); root.remove(); next?.focus(); }
      else emit(root, "action", { action: a.dataset.action });
    });
    return { setProgress(p) { root.dataset.progress = p; }, destroy() { mo.disconnect(); b.off(); } };
  });
}

// ---------- questionnaire (multi-step questions) ----------
//  <form data-ui="questionnaire"><div data-ui-part="progress"></div>
//   <fieldset data-ui-part="item" data-name="x" data-type="single|multiple|text" [data-required] [data-skippable]>
//     <legend data-ui-part="title">…</legend> <p data-ui-part="description">
//     <div data-ui-part="choices"><button data-ui-part="choice" data-value="a">…</button>…</div> | <textarea data-ui-part="input">
//     <p data-ui-part="error"></p></fieldset>…
//   <div data-ui-part="actions"><button data-ui-part="previous"><button data-ui-part="skip"><button data-ui-part="next"><button data-ui-part="submit"></div></form>
export function createQuestionnaire(root) {
  return once(root, "__uiQuestionnaire", () => {
    const b = bag(), items = parts(root, "item"), answers = {};
    let i = 0;
    const prog = part(root, "progress");
    items.forEach((it, k) => {
      it.id ||= uid("ui-q"); const t = part(it, "title") || it.querySelector("[data-ui-part=title]"); const err = it.querySelector("[data-ui-part=error]");
      if (err) { err.id ||= `${it.id}-err`; err.setAttribute("aria-live", "polite"); }
      const ch = it.querySelector("[data-ui-part=choices]");
      if (ch) { const multi = it.dataset.type === "multiple"; ch.setAttribute("role", multi ? "group" : "radiogroup"); if (t) { t.id ||= `${it.id}-t`; ch.setAttribute("aria-labelledby", t.id); }
        [...ch.querySelectorAll("[data-ui-part=choice]")].forEach((c, j) => { btn(c); c.setAttribute("role", multi ? "checkbox" : "radio"); c.setAttribute("aria-checked", "false"); c.tabIndex = multi || j === 0 ? 0 : -1; }); }
      it.hidden = k !== 0;
    });
    const val = (it) => {
      const ch = [...it.querySelectorAll("[data-ui-part=choice][aria-checked=true]")].map((c) => c.dataset.value);
      const inp = it.querySelector("[data-ui-part=input]"); const txt = inp?.value.trim();
      return it.dataset.type === "multiple" ? (ch.length ? ch : txt ? [txt] : []) : ch[0] || txt || "";
    };
    const valid = (it) => {
      const v = val(it), ok = it.dataset.required == null || (Array.isArray(v) ? v.length : v);
      const err = it.querySelector("[data-ui-part=error]");
      if (err) err.textContent = ok ? "" : (it.dataset.errorText || "Please answer this question.");
      it.toggleAttribute("data-invalid", !ok); it.querySelector("[data-ui-part=choices],[data-ui-part=input]")?.setAttribute("aria-invalid", String(!ok));
      if (!ok) it.querySelector("[data-ui-part=choices],[data-ui-part=input]")?.setAttribute("aria-describedby", err?.id || "");
      return ok;
    };
    const render = (focus = true) => {
      items.forEach((it, k) => { it.hidden = k !== i; it.dataset.state = k < i ? "answered" : k === i ? "current" : "upcoming"; });
      const done = i >= items.length;
      root.dataset.state = done ? "complete" : "active";
      if (prog) { prog.setAttribute("role", "progressbar"); prog.setAttribute("aria-valuemin", "0"); prog.setAttribute("aria-valuemax", items.length); prog.setAttribute("aria-valuenow", Math.min(i + 1, items.length)); prog.setAttribute("aria-valuetext", `Question ${Math.min(i + 1, items.length)} of ${items.length}`); prog.style.setProperty("--ui-value", `${(Math.min(i + 1, items.length) / items.length) * 100}%`); const l = prog.querySelector("[data-ui-part=label]"); if (l) l.textContent = `${Math.min(i + 1, items.length)} / ${items.length}`; }
      const cur = items[i];
      const show = (p, v) => { const el = part(root, p); if (el) el.hidden = !v; };
      show("previous", i > 0 && !done); show("skip", !!cur && cur.dataset.skippable != null); show("next", !!cur && i < items.length - 1); show("submit", !!cur && i === items.length - 1);
      const sum = part(root, "summary"); if (sum) sum.hidden = !done;
      if (focus && cur) (cur.querySelector("[data-ui-part=choice][tabindex='0'],[data-ui-part=input]"))?.focus();
      emit(root, "step", { index: i, total: items.length });
    };
    const go = (d, skip = false) => { const cur = items[i]; if (d > 0 && !skip && !valid(cur)) return; if (cur) answers[cur.dataset.name] = skip ? null : val(cur); i = Math.max(0, i + d); render(); };
    b.on(root, "click", (e) => {
      const c = e.target.closest("[data-ui-part=choice]");
      if (c) { const it = c.closest("[data-ui-part=item]"), multi = it.dataset.type === "multiple";
        if (multi) c.setAttribute("aria-checked", String(c.getAttribute("aria-checked") !== "true"));
        else it.querySelectorAll("[data-ui-part=choice]").forEach((x) => { x.setAttribute("aria-checked", String(x === c)); x.tabIndex = x === c ? 0 : -1; });
        if (it.hasAttribute("data-invalid")) valid(it); return; }
      const p = e.target.closest("[data-ui-part]")?.dataset.uiPart;
      if (p === "next") go(1); else if (p === "previous") go(-1); else if (p === "skip") go(1, true);
    });
    b.on(root, "keydown", (e) => { // radio-style arrows for single choice
      const c = e.target.closest("[data-ui-part=choice]"); if (!c) return; const it = c.closest("[data-ui-part=item]");
      const all = [...it.querySelectorAll("[data-ui-part=choice]")], k = all.indexOf(c), d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (d && it.dataset.type !== "multiple") { e.preventDefault(); const n = all[(k + d + all.length) % all.length]; n.focus(); n.click(); }
    });
    b.on(root, "submit", (e) => { e.preventDefault(); const cur = items[i]; if (cur && !valid(cur)) return; if (cur) answers[cur.dataset.name] = val(cur); i = items.length; render(false); emit(root, "submit", { answers: { ...answers } }); part(root, "summary")?.focus?.(); });
    render(false);
    return { get answers() { return { ...answers }; }, get index() { return i; }, reset() { i = 0; render(); }, destroy: b.off };
  });
}

// ---------- AI elements: collapsible run blocks ----------
function agentBlock(kind) {
  return (root) => once(root, "__uiAgent", () => {
    const b = bag(); root.dataset.status ||= "done";
    const d = disclosure(root, b, { defaultOpen: root.hasAttribute("data-default-open") || root.dataset.status === "running" || root.dataset.status === "streaming" });
    const live = part(root, "status"); if (live) live.setAttribute("aria-live", "polite");
    let started = Date.now();
    const update = () => {
      statusLabel(root);
      const st = parts(root, "step"); st.forEach((s) => { if (!s.dataset.status) s.dataset.status = "pending"; });
      if (kind === "plan" || kind === "task" || kind === "chain-of-thought" || kind === "queue") {
        const done = st.filter((s) => s.dataset.status === "done").length, p = part(root, "progress");
        if (p) { setText(p, `${done} of ${st.length}`); p.style?.setProperty("--ui-value", `${st.length ? (done / st.length) * 100 : 0}%`); }
        st.forEach((s) => { const v = s.dataset.status === "running" ? "step" : "false"; if (s.getAttribute("aria-current") !== v) s.setAttribute("aria-current", v); });
      }
      if (kind === "sources") { const n = part(root, "count"); setText(n, root.querySelectorAll("[data-ui-part=source]").length); }
      if (kind === "test-results") {
        const t = [...root.querySelectorAll("[data-ui-part=test]")], f = t.filter((x) => x.dataset.status === "failed").length, s = t.filter((x) => x.dataset.status === "skipped").length;
        const sum = part(root, "summary"); setText(sum, `${t.length - f - s} passed · ${f} failed${s ? ` · ${s} skipped` : ""}`);
        setData(root, "status", f ? "error" : "done"); statusLabel(root);
        root.querySelectorAll("[data-ui-part=suite]").forEach((su) => { const ff = su.querySelectorAll("[data-ui-part=test][data-status=failed]").length; setData(su, "status", ff ? "failed" : "passed"); });
      }
      if (kind === "reasoning") {
        const s = root.dataset.status;
        if (s === "streaming") { started = started || Date.now(); d.set(true, "stream"); if (part(root, "trigger")) part(root, "trigger").dataset.shimmer = ""; }
        else { const t = part(root, "trigger"); if (t) delete t.dataset.shimmer; const sec = Math.max(1, Math.round((Date.now() - started) / 1000));
          const lab = part(root, "label"); if (lab && root.dataset.prevStatus === "streaming") lab.textContent = `Thought for ${root.dataset.duration || sec}s`;
          if (root.dataset.prevStatus === "streaming" && root.dataset.autoClose !== "false") setTimeout(() => d.set(false, "done"), 600); }
        setData(root, "prevStatus", s);
      }
    };
    let busy = false; const mo = new MutationObserver(() => { if (busy) return; busy = true; try { update(); } finally { mo.takeRecords(); busy = false; } });
    mo.observe(root, { attributes: true, attributeFilter: ["data-status"], subtree: true });
    if (kind === "reasoning") started = root.dataset.status === "streaming" ? Date.now() : 0;
    update();
    b.on(root, "click", (e) => { const a = e.target.closest("[data-ui-part=copy]"); if (a) copyText((part(root, "output") || part(root, "content") || root).innerText, a); });
    const api = { open: () => d.set(true), close: () => d.set(false), toggle: () => d.set(!d.open), setStatus(s) { root.dataset.status = s; }, destroy() { mo.disconnect(); b.off(); } };
    if (kind === "terminal") {
      const out = part(root, "output");
      api.write = (txt) => { if (!out) return; const stick = out.scrollHeight - out.scrollTop - out.clientHeight < 8; out.append(document.createTextNode(txt)); if (stick) out.scrollTop = out.scrollHeight; };
      if (out) { out.setAttribute("role", "log"); out.setAttribute("aria-live", "polite"); out.tabIndex = 0; }
    }
    return api;
  });
}
export const createChainOfThought = agentBlock("chain-of-thought"), createTask = agentBlock("task"), createPlan = agentBlock("plan"),
  createTool = agentBlock("tool"), createReasoning = agentBlock("reasoning"), createSources = agentBlock("sources"), createSubagent = agentBlock("subagent"),
  createStackTrace = agentBlock("stack-trace"), createTestResults = agentBlock("test-results"), createTerminal = agentBlock("terminal");

// ---------- AI elements: interactive ----------
export function createCheckpoint(root) {
  return once(root, "__uiCheckpoint", () => { const b = bag(); root.setAttribute("role", "separator"); const r = part(root, "restore");
    if (r) { btn(r); b.on(r, "click", () => { if (emit(root, "restore", { id: root.dataset.id }, true)) { root.dataset.state = "restored"; } }); }
    return { destroy: b.off }; });
}
export function createConfirmation(root) {
  return once(root, "__uiConfirmation", () => {
    const b = bag(); root.setAttribute("role", "group"); root.dataset.status ||= "pending";
    const t = part(root, "title"); if (t) { t.id ||= uid("ui-conf"); root.setAttribute("aria-labelledby", t.id); }
    const render = () => { const s = root.dataset.status; const a = part(root, "actions"); if (a) a.hidden = s !== "pending";
      const r = part(root, "result"); if (r) { r.hidden = s === "pending"; r.textContent = s === "approved" ? (root.dataset.approvedText || "Approved") : s === "rejected" ? (root.dataset.rejectedText || "Rejected") : ""; r.setAttribute("role", "status"); } };
    const decide = (s) => { if (!emit(root, s === "approved" ? "approve" : "reject", {}, true)) return; root.dataset.status = s; render(); part(root, "result")?.focus?.(); };
    parts(root, "approve").forEach((x) => { btn(x); b.on(x, "click", () => decide("approved")); });
    parts(root, "reject").forEach((x) => { btn(x); b.on(x, "click", () => decide("rejected")); });
    render(); return { approve: () => decide("approved"), reject: () => decide("rejected"), destroy: b.off };
  });
}
export function createContextUsage(root) {
  return once(root, "__uiContext", () => {
    const m = part(root, "meter") || root;
    const render = () => { const used = +root.dataset.used || 0, max = +root.dataset.max || 1, pct = Math.min(100, (used / max) * 100);
      m.setAttribute("role", "meter"); m.setAttribute("aria-valuemin", "0"); m.setAttribute("aria-valuemax", String(max)); m.setAttribute("aria-valuenow", String(used));
      const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
      m.setAttribute("aria-valuetext", `${pct.toFixed(0)}% of context used (${fmt(used)} of ${fmt(max)} tokens)`); if (!m.hasAttribute("aria-label")) m.setAttribute("aria-label", "Context window");
      root.style.setProperty("--ui-value", `${pct}%`); root.dataset.level = pct >= 90 ? "critical" : pct >= 70 ? "warning" : "ok";
      parts(root, "percent").forEach((p) => (p.textContent = `${pct.toFixed(0)}%`)); parts(root, "used").forEach((p) => (p.textContent = fmt(used))); parts(root, "max").forEach((p) => (p.textContent = fmt(max))); };
    const mo = new MutationObserver(render); mo.observe(root, { attributes: true, attributeFilter: ["data-used", "data-max"] }); render();
    return { set(used) { root.dataset.used = used; }, destroy: () => mo.disconnect() };
  });
}
//  <ul data-ui="file-tree"><li data-ui-part="folder" data-path="src"><span data-ui-part="label">src</span><ul data-ui-part="group"><li data-ui-part="file" data-path="src/a.js">a.js</li></ul></li></ul>
export function createFileTree(root) {
  return once(root, "__uiFileTree", () => {
    const b = bag(); root.setAttribute("role", "tree"); if (!root.hasAttribute("aria-label")) root.setAttribute("aria-label", "Files");
    const nodes = () => [...root.querySelectorAll("[data-ui-part=folder],[data-ui-part=file]")];
    const visible = () => nodes().filter((n) => !n.parentElement.closest("[data-ui-part=group][hidden]"));
    nodes().forEach((n) => { n.setAttribute("role", "treeitem"); n.tabIndex = -1; const g = n.querySelector(":scope > [data-ui-part=group]");
      if (g) { g.setAttribute("role", "group"); const open = n.hasAttribute("data-default-open") || n.getAttribute("aria-expanded") === "true"; n.setAttribute("aria-expanded", String(open)); g.hidden = !open; }
      n.setAttribute("aria-level", String(1 + (n.parentElement.closest("[data-ui-part=folder]") ? [...ancestors(n)].length : 0))); n.setAttribute("aria-selected", "false"); });
    function* ancestors(n) { let p = n.parentElement.closest("[data-ui-part=folder]"); while (p && root.contains(p)) { yield p; p = p.parentElement.closest("[data-ui-part=folder]"); } }
    (nodes().find((n) => n.dataset.selected != null) || nodes()[0])?.setAttribute("tabindex", "0");
    const sel = nodes().find((n) => n.dataset.selected != null); if (sel) sel.setAttribute("aria-selected", "true");
    const toggle = (n, v) => { const g = n.querySelector(":scope > [data-ui-part=group]"); if (!g) return; const o = v ?? n.getAttribute("aria-expanded") !== "true"; n.setAttribute("aria-expanded", String(o)); g.hidden = !o; emit(root, "toggle", { path: n.dataset.path, open: o }); };
    const focus = (n) => { nodes().forEach((x) => (x.tabIndex = -1)); n.tabIndex = 0; n.focus(); };
    const select = (n) => { nodes().forEach((x) => x.setAttribute("aria-selected", "false")); n.setAttribute("aria-selected", "true"); emit(root, "select", { path: n.dataset.path, type: n.dataset.uiPart }); };
    b.on(root, "click", (e) => { const n = e.target.closest("[data-ui-part=folder],[data-ui-part=file]"); if (!n) return; e.stopPropagation(); focus(n); if (n.dataset.uiPart === "folder") toggle(n); else select(n); });
    b.on(root, "keydown", (e) => {
      const n = e.target.closest("[role=treeitem]"); if (!n) return; const v = visible(), k = v.indexOf(n), folder = n.dataset.uiPart === "folder", open = n.getAttribute("aria-expanded") === "true";
      const mv = { ArrowDown: v[k + 1], ArrowUp: v[k - 1], Home: v[0], End: v.at(-1) }[e.key];
      if (mv) { e.preventDefault(); focus(mv); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (folder && !open) toggle(n, true); else if (folder) { const c = n.querySelector(":scope > [data-ui-part=group] > [role=treeitem]"); c && focus(c); } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (folder && open) toggle(n, false); else { const p = n.parentElement.closest("[data-ui-part=folder]"); p && root.contains(p) && focus(p); } }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); folder ? toggle(n) : select(n); }
    });
    return { toggle, select, destroy: b.off };
  });
}
//  <form data-ui="prompt-input"><div data-ui-part="attachments"></div><textarea data-ui-part="input"></textarea>
//    <input type="file" data-ui-part="file" hidden multiple><button data-ui-part="attach"><button data-ui-part="submit"></form>
export function createPromptInput(root) {
  return once(root, "__uiPrompt", () => {
    const b = bag(), ta = part(root, "input"), sub = part(root, "submit"), file = part(root, "file"), att = part(root, "attachments");
    let files = [];
    root.dataset.status ||= "ready";
    const sync = () => { const busy = root.dataset.status === "streaming" || root.dataset.status === "submitted";
      if (sub) { btn(sub); sub.type = busy ? "button" : "submit"; sub.disabled = !busy && !ta?.value.trim() && !files.length; sub.setAttribute("aria-label", busy ? (sub.dataset.stopLabel || "Stop") : (sub.dataset.sendLabel || "Send")); sub.dataset.state = busy ? "stop" : "send"; }
      if (ta) { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, +(root.dataset.maxHeight || 200))}px`; } };
    const renderFiles = () => { if (!att) return; att.replaceChildren(...files.map((f, k) => { const a = document.createElement("div"); a.dataset.ui = "attachment"; a.dataset.size = "sm";
      a.innerHTML = `<span data-ui-part="media" aria-hidden="true"></span><span data-ui-part="content"><span data-ui-part="title"></span><span data-ui-part="description"></span></span><button type="button" data-ui-part="action" data-action="remove"></button>`;
      a.querySelector("[data-ui-part=title]").textContent = f.name; a.querySelector("[data-ui-part=description]").textContent = `${Math.max(1, Math.round(f.size / 1024))} KB`;
      const rm = a.querySelector("[data-ui-part=action]"); rm.setAttribute("aria-label", `Remove ${f.name}`); rm.textContent = "×";
      rm.addEventListener("click", () => { files.splice(k, 1); renderFiles(); ta?.focus(); }); return a; })); att.hidden = !files.length; sync(); };
    if (ta) { if (!ta.hasAttribute("aria-label")) ta.setAttribute("aria-label", "Message"); b.on(ta, "input", sync);
      b.on(ta, "keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (root.dataset.status === "ready" || root.dataset.status === "error") root.requestSubmit ? root.requestSubmit() : root.dispatchEvent(new Event("submit", { cancelable: true })); } }); }
    const at = part(root, "attach"); if (at && file) { btn(at); if (!at.hasAttribute("aria-label")) at.setAttribute("aria-label", "Attach files"); b.on(at, "click", () => file.click()); b.on(file, "change", () => { files.push(...file.files); file.value = ""; renderFiles(); }); }
    b.on(root, "submit", (e) => { e.preventDefault(); const text = ta?.value.trim() || ""; if (!text && !files.length) return;
      if (!emit(root, "submit", { text, files: [...files] }, true)) return; if (ta) ta.value = ""; files = []; renderFiles(); sync(); ta?.focus(); });
    if (sub) b.on(sub, "click", (e) => { if (sub.dataset.state === "stop") { e.preventDefault(); emit(root, "stop", {}); } });
    const mo = new MutationObserver(sync); mo.observe(root, { attributes: true, attributeFilter: ["data-status"] });
    if (att) att.hidden = true; sync();
    return { setValue(v) { if (ta) { ta.value = v; sync(); ta.focus(); } }, setStatus(s) { root.dataset.status = s; }, destroy() { mo.disconnect(); b.off(); } };
  });
}
export function createQueue(root) {
  return once(root, "__uiQueue", () => {
    const b = bag(), todo = part(root, "pending"), done = part(root, "completed");
    const count = () => { parts(root, "pending-count").forEach((c) => (c.textContent = todo?.children.length ?? 0)); parts(root, "completed-count").forEach((c) => (c.textContent = done?.children.length ?? 0)); };
    b.on(root, "change", (e) => { const cb = e.target.closest("input[type=checkbox]"); const it = cb?.closest("[data-ui-part=item]"); if (!it) return;
      (cb.checked ? done : todo)?.append(it); it.dataset.status = cb.checked ? "done" : "pending"; count(); cb.focus(); emit(root, "change", { id: it.dataset.id, done: cb.checked }); });
    count(); return { destroy: b.off };
  });
}
export function createSuggestion(root) {
  return once(root, "__uiSuggestion", () => {
    const b = bag(); root.setAttribute("role", root.getAttribute("role") || "group"); if (!root.hasAttribute("aria-label")) root.setAttribute("aria-label", "Suggestions");
    parts(root, "item").forEach(btn);
    b.on(root, "click", (e) => { const it = e.target.closest("[data-ui-part=item]"); if (!it) return; const text = it.dataset.value || it.textContent.trim();
      if (!emit(root, "suggest", { text }, true)) return; const tgt = root.dataset.target && document.querySelector(root.dataset.target);
      if (tgt) { const api = tgt.__uiPrompt; if (api) api.setValue(text); if (root.dataset.submit != null) tgt.requestSubmit?.(); } });
    return { destroy: b.off };
  });
}

// ---------- chart (SVG from an accessible table) ----------
//  <figure data-ui="chart" data-type="bar|line"><figcaption>…</figcaption><table>…</table></figure>
export function createChart(root) {
  return once(root, "__uiChart", () => {
    const b = bag(), table = root.querySelector("table"); if (!table) return { destroy() {} };
    const NS = "http://www.w3.org/2000/svg", head = [...(table.tHead?.rows[0]?.cells || [])].map((c) => c.textContent.trim());
    const rows = [...table.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.textContent.trim()));
    const series = head.slice(1), labels = rows.map((r) => r[0]), data = series.map((_, s) => rows.map((r) => parseFloat(r[s + 1]) || 0));
    const max = Math.max(1, ...data.flat()), W = 600, H = 220, P = 28, cw = (W - P * 2) / labels.length;
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${H + 24}`); svg.dataset.uiPart = "plot"; svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${root.querySelector("figcaption")?.textContent.trim() || "Chart"}: ${root.dataset.type || "bar"} chart, data in the table below`);
    const el = (n, a, txt) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; svg.append(e); return e; };
    for (let g = 0; g <= 4; g++) { const y = P / 2 + (H - P) * (g / 4); el("line", { x1: P, x2: W - P / 2, y1: y, y2: y, "data-ui-part": "grid" }); el("text", { x: P - 6, y: y + 4, "text-anchor": "end", "data-ui-part": "axis" }, Math.round(max * (1 - g / 4))); }
    labels.forEach((l, i) => el("text", { x: P + cw * i + cw / 2, y: H + 16, "text-anchor": "middle", "data-ui-part": "axis" }, l));
    const y = (v) => P / 2 + (H - P) * (1 - v / max);
    data.forEach((d, s) => {
      if (root.dataset.type === "line") { el("polyline", { points: d.map((v, i) => `${P + cw * i + cw / 2},${y(v)}`).join(" "), "data-ui-part": "series", "data-series": s, fill: "none" });
        d.forEach((v, i) => el("circle", { cx: P + cw * i + cw / 2, cy: y(v), r: 4, "data-ui-part": "point", "data-series": s }).append(Object.assign(document.createElementNS(NS, "title"), { textContent: `${labels[i]} · ${series[s]}: ${v}` }))); }
      else { const bw = (cw * 0.7) / data.length;
        d.forEach((v, i) => el("rect", { x: P + cw * i + cw * 0.15 + bw * s, y: y(v), width: bw - 2, height: Math.max(0, H - P / 2 - y(v)), rx: 3, "data-ui-part": "series", "data-series": s }).append(Object.assign(document.createElementNS(NS, "title"), { textContent: `${labels[i]} · ${series[s]}: ${v}` }))); }
    });
    const legend = document.createElement("ul"); legend.dataset.uiPart = "legend";
    series.forEach((s, i) => { const li = document.createElement("li"); li.dataset.series = i; li.textContent = s; legend.append(li); });
    table.before(svg, legend); table.dataset.uiPart ||= "data"; table.hidden = root.dataset.showTable == null;
    const tg = document.createElement("button"); tg.type = "button"; tg.dataset.uiPart = "table-toggle"; table.id ||= uid("ui-chart-t"); tg.setAttribute("aria-controls", table.id);
    const st = () => { tg.textContent = table.hidden ? "Show data table" : "Hide data table"; tg.setAttribute("aria-expanded", String(!table.hidden)); }; st();
    b.on(tg, "click", () => { table.hidden = !table.hidden; st(); }); table.before(tg);
    return { destroy() { b.off(); svg.remove(); legend.remove(); tg.remove(); table.hidden = false; } };
  });
}

// ---------- drawer: dialog + drag-to-dismiss (vaul-like) ----------
export function withDragDismiss(createDialog) {
  return (root) => {
    const api = createDialog(root), c = root.querySelector(":scope > [data-ui-part=content], [data-ui-part=content]"), side = root.dataset.side || "bottom";
    if (!c || root.dataset.drag === "false") return api;
    const h = c.querySelector("[data-ui-part=handle]") || c; let sy = null, d = 0;
    const axis = side === "bottom" || side === "top" ? "Y" : "X", sign = side === "bottom" || side === "right" ? 1 : -1;
    const down = (e) => { if (e.target.closest("button,a,input,select,textarea,[contenteditable]") || e.button) return; sy = axis === "Y" ? e.clientY : e.clientX; d = 0; c.style.transition = "none"; h.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (sy == null) return; d = Math.max(0, ((axis === "Y" ? e.clientY : e.clientX) - sy) * sign); c.style.transform = `translate${axis}(${d * sign}px)`; c.dataset.dragging = ""; };
    const up = () => { if (sy == null) return; sy = null; c.style.transition = ""; delete c.dataset.dragging; const size = axis === "Y" ? c.offsetHeight : c.offsetWidth;
      c.style.transform = ""; if (d > Math.min(120, size * 0.3)) { (api.close || (() => c.close?.()))(); emit(root, "dragdismiss", {}); } };
    h.addEventListener("pointerdown", down); h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    const d0 = api.destroy; api.destroy = () => { h.removeEventListener("pointerdown", down); h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); d0?.(); };
    return api;
  };
}
