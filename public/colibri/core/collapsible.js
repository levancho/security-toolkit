// Colibri UI: Collapsible (shadcn Collapsible, Metronic Collapse) + Accordion (shadcn/Metronic Accordion).
//  Collapsible: <div data-ui="collapsible" [data-default-open] [data-disabled]>
//                 <button data-ui-part="trigger">…</button> <div data-ui-part="content">…</div></div>
//  Accordion:   <div data-ui="accordion" data-type="single|multiple" [data-collapsible="true"] [data-default-value="a,b"]>
//                 <div data-ui-part="item" data-value="a" [data-disabled]>
//                   <button data-ui-part="trigger">…</button><div data-ui-part="content">…</div></div>…</div>
// State: data-state=open|closed on root/item/trigger/content, aria-expanded, content[hidden]
import { uid, parts, part, emit, setState, btn, once, bag, roving, isDisabled, owner } from "./util.js";

function wirePair(trigger, content, id) {
  btn(trigger);
  content.id ||= `${id}-content`; trigger.id ||= `${id}-trigger`;
  trigger.setAttribute("aria-controls", content.id);
}
function show(els, open, trigger, content) {
  els.forEach((e) => setState(e, open ? "open" : "closed"));
  trigger?.setAttribute("aria-expanded", String(open));
  if (content) content.hidden = !open;
}

export function createCollapsible(root, o = {}) {
  return once(root, "__uiCollapsible", () => {
    const id = root.id || uid("ui-collapsible"), b = bag();
    const trigger = part(root, "trigger"), content = part(root, "content");
    let open = !!(o.defaultOpen ?? root.hasAttribute("data-default-open"));
    if (trigger && content) wirePair(trigger, content, id);
    const render = () => show([root, trigger, content], open, trigger, content);
    const set = (v) => {
      if (v === open || (root.dataset.disabled != null)) return;
      open = v; render(); o.onOpenChange?.(open); emit(root, open ? "open" : "close", { open });
    };
    if (trigger) b.on(trigger, "click", () => set(!open));
    render();
    return { get open() { return open; }, set open(v) { set(!!v); }, toggle: () => set(!open), destroy: b.off };
  });
}

export function createAccordion(root, o = {}) {
  return once(root, "__uiAccordion", () => {
    const id = root.id || uid("ui-accordion"), b = bag();
    const type = o.type || root.dataset.type || "single";
    const collapsible = o.collapsible ?? root.dataset.collapsible !== "false";
    const orientation = root.dataset.orientation || "vertical";
    const items = () => parts(root, "item");
    let value = new Set(String(o.defaultValue ?? root.dataset.defaultValue ?? "").split(",").filter(Boolean));
    items().forEach((it, i) => {
      const t = part(it, "trigger") || it.querySelector('[data-ui-part="trigger"]');
      const c = it.querySelector('[data-ui-part="content"]');
      it.dataset.value ||= String(i);
      if (t && c) { wirePair(t, c, `${id}-${it.dataset.value}`); c.setAttribute("role", "region"); c.setAttribute("aria-labelledby", t.id); }
      if (it.dataset.disabled != null && t) t.setAttribute("aria-disabled", "true");
    });
    const trig = (it) => it.querySelector('[data-ui-part="trigger"]');
    const render = () => items().forEach((it) => {
      const on = value.has(it.dataset.value), t = trig(it), c = it.querySelector('[data-ui-part="content"]');
      show([it, t, c], on, t, c);
      if (t && type === "single" && on && !collapsible) t.setAttribute("aria-disabled", "true");
      else if (t && it.dataset.disabled == null) t.removeAttribute("aria-disabled");
    });
    const toggle = (v) => {
      const it = items().find((i) => i.dataset.value === v);
      if (!it || it.dataset.disabled != null) return;
      const was = value.has(v);
      if (type === "single") { if (was && !collapsible) return; value = new Set(was ? [] : [v]); }
      else was ? value.delete(v) : value.add(v);
      render();
      const out = type === "single" ? ([...value][0] ?? null) : [...value];
      o.onValueChange?.(out); emit(root, "change", { value: out });
    };
    b.on(root, "click", (e) => {
      const t = e.target.closest('[data-ui-part="trigger"]'); const it = t?.closest('[data-ui-part="item"]');
      if (it && owner(it) === root) toggle(it.dataset.value);
    });
    b.on(root, "keydown", (e) => {
      const t = e.target.closest('[data-ui-part="trigger"]'); if (!t) return;
      const ts = items().map(trig).filter(Boolean);
      if (!ts.includes(t)) return;
      const n = roving(ts.filter((x) => x.closest('[data-ui-part="item"]').dataset.disabled == null), t, e.key, { orientation });
      if (n) { e.preventDefault(); n.focus(); }
    });
    render();
    return { get value() { return type === "single" ? ([...value][0] ?? null) : [...value]; }, toggle, destroy: b.off };
  });
}
