// Colibri UI: auth blocks (shadcn login-01..05 / signup-01..05).
//  <form data-ui="auth-form" data-default-view="password" novalidate>
//    <div data-ui-part="view" data-view="password">…fields…</div>   other views: magic-link | otp | forgot | sent
//    <button type="button" data-ui-auth-view="magic-link">Email me a link</button>
//    <button data-ui-part="provider" data-provider="google">Continue with Google</button>
//    <p data-ui-part="status" role="status"></p>
//  Fields are data-ui="field"; validation uses native constraints (+ data-match="#password" for confirm).
//  Events: ui:viewchange {view}; ui:submit {view, values} (cancelable; call api.setStatus/setErrors async);
//          ui:provider {provider}. Only the visible view's controls are validated and submitted.
import { part, parts, emit, once, bag, btn } from "./util.js";

export function createAuthForm(root) {
  return once(root, "__uiAuth", () => {
    const b = bag(), views = parts(root, "view");
    root.noValidate = true;
    let view = root.dataset.defaultView || views[0]?.dataset.view || "default";
    const status = part(root, "status"); if (status) { status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); }
    const show = (v, focus = true) => {
      view = v; root.dataset.view = v;
      views.forEach((el) => { const on = el.dataset.view === v; el.hidden = !on; el.querySelectorAll("input,select,textarea,button").forEach((c) => { if (!on) { if (c.dataset.authDisabled == null) c.dataset.authDisabled = String(c.disabled); c.disabled = true; } else if (c.dataset.authDisabled != null) { c.disabled = c.dataset.authDisabled === "true"; delete c.dataset.authDisabled; } }); });
      root.querySelectorAll("[data-ui-auth-view]").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.uiAuthView === v)));
      if (status) { status.textContent = ""; delete status.dataset.tone; }
      if (focus) (views.find((x) => x.dataset.view === v)?.querySelector("[autofocus],input:not([type=hidden]),button"))?.focus();
      emit(root, "viewchange", { view: v });
    };
    const fields = () => [...root.querySelectorAll("[data-ui=field]")].filter((f) => !f.closest("[data-ui-part=view][hidden]"));
    const validate = () => {
      let first = null;
      for (const f of fields()) {
        const c = f.querySelector("[data-ui-part=control]") || f.querySelector("input,select,textarea"); if (!c) continue;
        let msg = c.validity.valid ? "" : (c.dataset.errorText || c.validationMessage || "Invalid value");
        if (!msg && c.dataset.match) { const o = root.querySelector(c.dataset.match); if (o && o.value !== c.value) msg = c.dataset.matchText || "Passwords do not match"; }
        if (!msg && c.type === "email" && c.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.value)) msg = "Enter a valid email address";
        f.__uiField?.setError(msg || null); if (msg && !first) first = c;
      }
      // pin inputs: require full length
      root.querySelectorAll("[data-ui=pin-input]").forEach((p) => { if (p.closest("[data-ui-part=view][hidden]")) return; const v = [...p.querySelectorAll("input")].map((i) => i.value).join("");
        const bad = p.dataset.required != null && v.length < (+p.dataset.length || 6); p.toggleAttribute("data-invalid", bad); if (bad && !first) first = p.querySelector("input"); });
      first?.focus(); return !first;
    };
    const values = () => { const fd = new FormData(root), o = {}; for (const [k, v] of fd) { if (k in o) o[k] = [].concat(o[k], v); else o[k] = v; } return o; };
    const api = {
      get view() { return view; }, show, validate, values,
      setStatus(msg, tone = "info") { if (status) { status.textContent = msg; status.dataset.tone = tone; } },
      setErrors(map) { for (const [name, msg] of Object.entries(map)) { const c = root.querySelector(`[name="${name}"]`); c?.closest("[data-ui=field]")?.__uiField?.setError(msg); } },
      setBusy(on) { root.toggleAttribute("aria-busy", on); root.dataset.state = on ? "busy" : "idle"; root.querySelectorAll("button[type=submit],button:not([type])").forEach((x) => { if (!x.closest("[hidden]")) x.disabled = on; }); },
      destroy: b.off,
    };
    b.on(root, "click", (e) => {
      const t = e.target.closest("[data-ui-auth-view]"); if (t) { e.preventDefault(); show(t.dataset.uiAuthView); return; }
      const p = e.target.closest("[data-ui-part=provider]"); if (p) { e.preventDefault(); emit(root, "provider", { provider: p.dataset.provider }); }
    });
    root.querySelectorAll("[data-ui-auth-view],[data-ui-part=provider]").forEach(btn);
    b.on(root, "submit", (e) => {
      e.preventDefault(); if (!validate()) { api.setStatus(root.dataset.invalidText || "Please fix the highlighted fields.", "error"); return; }
      const next = root.querySelector(`[data-ui-part=view][data-view="${view}"]`)?.dataset.next;
      if (emit(root, "submit", { view, values: values() }, true) && next) show(next);
    });
    show(view, false);
    return api;
  });
}
