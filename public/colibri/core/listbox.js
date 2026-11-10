// Colibri UI: Select (custom listbox), Combobox (autocomplete), Command (palette). Shared listbox core.
//  Select:   <div data-ui="select" data-name="lang" [data-default-value] [data-multiple] [data-placeholder]>
//              <button data-ui-part="trigger"><span data-ui-part="value"></span></button>
//              <div data-ui-part="content" hidden>
//                <div data-ui-part="group"><div data-ui-part="label">EU</div>
//                  <div data-ui-part="option" data-value="en">English</div> …</div></div></div>
//            → renders a hidden <input name=lang> so it posts with normal forms (FreeMarker/Spring).
//  Combobox: <div data-ui="combobox" data-name="city" [data-allow-custom] [data-multiple]>
//              <input data-ui-part="input"> <button data-ui-part="trigger">▾</button>(optional)
//              <div data-ui-part="content" hidden> options… <div data-ui-part="empty">No results</div></div></div>
//            Remote data: listen to ui:search {query} and replace options, then call api.refresh().
//  Command:  <div data-ui="command" [data-hotkey="k"]>   (inline; put it inside a Dialog for Cmd/Ctrl+K)
//              <input data-ui-part="input"> <div data-ui-part="list"> groups/options/separators/empty </div></div>
//            Options may have data-keywords="extra words". Enter fires ui:select {value, option}.
import { uid, parts, emit, setState, btn, once, bag, typeahead, place, layer, isDisabled } from "./util.js";

const opts = (box) => [...box.querySelectorAll('[data-ui-part="option"]')];
const label = (o) => (o.dataset.label || o.textContent).trim();
const visible = (o) => !o.hidden && !isDisabled(o);

function wireList(box, id, multiple) {
  box.setAttribute("role", "listbox"); box.id ||= `${id}-listbox`;
  if (multiple) box.setAttribute("aria-multiselectable", "true");
  box.querySelectorAll('[data-ui-part="group"]').forEach((g, i) => {
    g.setAttribute("role", "group"); const l = g.querySelector('[data-ui-part="label"]');
    if (l) { l.id ||= `${id}-g${i}`; g.setAttribute("aria-labelledby", l.id); }
  });
  box.querySelectorAll('[data-ui-part="separator"]').forEach((s) => s.setAttribute("role", "separator"));
  opts(box).forEach((o, i) => { o.setAttribute("role", "option"); o.id ||= `${id}-o${i}`; o.dataset.value ??= label(o); if (o.hasAttribute("disabled") || o.dataset.disabled != null) o.setAttribute("aria-disabled", "true"); });
}
function highlight(box, o, owner) {
  opts(box).forEach((x) => { x.toggleAttribute("data-highlighted", x === o); });
  if (o) { owner.setAttribute("aria-activedescendant", o.id); { const sc = o.parentElement && o.closest("[role=listbox],[data-ui-part=list],[data-ui-part=content]"); if (sc && sc.scrollHeight > sc.clientHeight) { const r = o.getBoundingClientRect(), v = sc.getBoundingClientRect(); if (r.top < v.top) sc.scrollTop -= v.top - r.top; else if (r.bottom > v.bottom) sc.scrollTop += r.bottom - v.bottom; } } }
  else owner.removeAttribute("aria-activedescendant");
}
function step(box, cur, key) {
  const list = opts(box).filter(visible); if (!list.length) return null;
  const i = list.indexOf(cur);
  if (key === "ArrowDown") return list[i < 0 ? 0 : Math.min(i + 1, list.length - 1)];
  if (key === "ArrowUp") return list[i < 0 ? list.length - 1 : Math.max(i - 1, 0)];
  if (key === "Home") return list[0]; if (key === "End") return list[list.length - 1];
  if (key === "PageDown") return list[Math.min(i + 10, list.length - 1)]; if (key === "PageUp") return list[Math.max(i - 10, 0)];
  return undefined;
}
function hiddenInputs(root, name, values) {
  if (!name) return;
  root.querySelectorAll(":scope > input[data-ui-generated]").forEach((i) => i.remove());
  (values.length ? values : [""]).forEach((v) => {
    const i = root.ownerDocument.createElement("input"); i.type = "hidden"; i.name = name; i.value = v; i.dataset.uiGenerated = ""; root.append(i);
  });
}
function selection(root, o) {
  const multiple = o.multiple ?? root.hasAttribute("data-multiple");
  let values = String(o.defaultValue ?? root.dataset.defaultValue ?? "").split(",").filter(Boolean);
  if (!multiple) values = values.slice(0, 1);
  return {
    multiple, get values() { return values; },
    toggle(v) { if (multiple) values = values.includes(v) ? values.filter((x) => x !== v) : [...values, v]; else values = [v]; },
    set(vs) { values = multiple ? vs : vs.slice(0, 1); },
  };
}
function renderSelected(box, sel) {
  opts(box).forEach((o) => { const on = sel.values.includes(o.dataset.value); o.setAttribute("aria-selected", String(on)); setState(o, on ? "checked" : "unchecked"); });
}

export function createSelect(root, o = {}) {
  return once(root, "__uiSelect", () => {
    const b = bag(), id = root.id || uid("ui-select"), ta = typeahead();
    const trigger = btn(parts(root, "trigger")[0]), box = parts(root, "content")[0], valueEl = parts(root, "value")[0];
    const sel = selection(root, o), name = o.name || root.dataset.name, ph = root.dataset.placeholder || "";
    wireList(box, id, sel.multiple); box.hidden = true; box.tabIndex = -1;
    trigger.setAttribute("role", "combobox"); trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-controls", box.id); trigger.setAttribute("aria-expanded", "false");
    let open = false, hl = null, unlayer = null;
    const render = () => {
      renderSelected(box, sel);
      const text = sel.values.map((v) => opts(box).find((x) => x.dataset.value === v)).filter(Boolean).map(label).join(", ");
      if (valueEl) { valueEl.textContent = text || ph; valueEl.toggleAttribute("data-placeholder", !text); }
      root.dataset.value = sel.values.join(","); hiddenInputs(root, name, sel.values);
      if (root.dataset.disabled != null) trigger.disabled = true;
    };
    const setOpen = (v) => {
      if (v === open) return; open = v; box.hidden = !open; trigger.setAttribute("aria-expanded", String(open));
      [root, trigger, box].forEach((e) => setState(e, open ? "open" : "closed"));
      if (open) {
        place(box, trigger, { side: root.dataset.side || "bottom", align: root.dataset.align || "start" });
        box.style.minWidth = `${trigger.getBoundingClientRect().width}px`;
        hl = opts(box).find((x) => sel.values.includes(x.dataset.value) && visible(x)) || opts(box).find(visible); highlight(box, hl, trigger);
        unlayer = layer(box, () => setOpen(false), { ignore: [trigger] });
      } else { unlayer?.(); unlayer = null; highlight(box, null, trigger); }
      emit(root, open ? "open" : "close");
    };
    const choose = (opt) => {
      if (!opt || !visible(opt)) return; sel.toggle(opt.dataset.value); render();
      const v = sel.multiple ? sel.values : sel.values[0]; o.onValueChange?.(v); emit(root, "change", { value: v });
      if (!sel.multiple) { setOpen(false); trigger.focus(); }
    };
    b.on(trigger, "click", () => setOpen(!open));
    b.on(trigger, "keydown", (e) => {
      const k = e.key;
      if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); return setOpen(true); }
      if (!open) { if (k.length === 1 && /\S/.test(k)) { const m = ta(opts(box), opts(box).find((x) => x.dataset.value === sel.values[0]), k); if (m && !sel.multiple) choose(m); } return; }
      const n = step(box, hl, k);
      if (n !== undefined) { e.preventDefault(); hl = n; highlight(box, hl, trigger); return; }
      if (k === "Enter" || k === " ") { e.preventDefault(); return choose(hl); }
      if (k === "Tab") return setOpen(false);
      if (k.length === 1 && /\S/.test(k)) { const m = ta(opts(box).filter(visible), hl, k); if (m) { hl = m; highlight(box, hl, trigger); } }
    });
    b.on(box, "click", (e) => choose(e.target.closest('[data-ui-part="option"]')));
    b.on(box, "pointermove", (e) => { const x = e.target.closest('[data-ui-part="option"]'); if (x && x !== hl && visible(x)) { hl = x; highlight(box, hl, trigger); } });
    render();
    return { get value() { return sel.multiple ? sel.values : sel.values[0] ?? null; }, set value(v) { sel.set([].concat(v ?? [])); render(); }, show: () => setOpen(true), hide: () => setOpen(false), refresh() { wireList(box, id, sel.multiple); render(); }, destroy() { unlayer?.(); b.off(); } };
  });
}

function filterList(list, q) {
  const s = q.trim().toLowerCase(); let count = 0;
  opts(list).forEach((o) => {
    const hay = `${label(o)} ${o.dataset.value} ${o.dataset.keywords || ""}`.toLowerCase();
    const ok = !s || hay.includes(s); o.hidden = !ok; if (ok) count++;
  });
  list.querySelectorAll('[data-ui-part="group"]').forEach((g) => { g.hidden = !opts(g).some((o) => !o.hidden); });
  list.querySelectorAll('[data-ui-part="separator"]').forEach((sp) => { sp.hidden = !!s; });
  const empty = list.querySelector('[data-ui-part="empty"]'); if (empty) empty.hidden = count > 0;
  return count;
}

export function createCombobox(root, o = {}) {
  return once(root, "__uiCombobox", () => {
    const b = bag(), id = root.id || uid("ui-combobox");
    const input = parts(root, "input")[0], box = parts(root, "content")[0], trigger = btn(parts(root, "trigger")[0] || null);
    const sel = selection(root, o), name = o.name || root.dataset.name, allowCustom = root.hasAttribute("data-allow-custom");
    const remote = root.hasAttribute("data-remote");
    wireList(box, id, sel.multiple); box.hidden = true;
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", box.id); input.setAttribute("aria-expanded", "false"); input.autocomplete = "off";
    trigger?.setAttribute("tabindex", "-1"); trigger?.setAttribute("aria-label", trigger.getAttribute("aria-label") || "Show options");
    let open = false, hl = null, unlayer = null;
    const textFor = (v) => { const x = opts(box).find((q) => q.dataset.value === v); return x ? label(x) : v; };
    const render = () => {
      renderSelected(box, sel); root.dataset.value = sel.values.join(","); hiddenInputs(root, name, sel.values);
      const chips = parts(root, "chips")[0];
      if (chips && sel.multiple) {
        const doc = root.ownerDocument;
        chips.replaceChildren(...sel.values.map((v) => {
          const chip = doc.createElement("span"), remove = doc.createElement("button");
          chip.dataset.uiPart = "chip"; chip.dataset.value = v;
          chip.textContent = textFor(v);
          remove.type = "button"; remove.dataset.uiPart = "chip-remove";
          remove.setAttribute("aria-label", `Remove ${textFor(v)}`); remove.textContent = "×";
          chip.append(remove);
          return chip;
        }));
      }
    };
    const setOpen = (v) => {
      if (v === open) return; open = v; box.hidden = !open; input.setAttribute("aria-expanded", String(open));
      [root, box].forEach((e) => setState(e, open ? "open" : "closed"));
      if (open) { place(box, input, { side: "bottom" }); box.style.minWidth = `${input.getBoundingClientRect().width}px`; unlayer = layer(box, () => setOpen(false), { ignore: [input, trigger] }); }
      else { unlayer?.(); unlayer = null; hl = null; highlight(box, null, input); }
      emit(root, open ? "open" : "close");
    };
    const commit = (v) => {
      sel.toggle(v); render();
      if (!sel.multiple) input.value = textFor(v); else input.value = "";
      if (!remote) filterList(box, sel.multiple ? "" : "");
      const out = sel.multiple ? sel.values : sel.values[0]; o.onValueChange?.(out); emit(root, "change", { value: out });
      if (!sel.multiple) setOpen(false);
    };
    b.on(input, "input", () => {
      const q = input.value; setOpen(true);
      if (remote) emit(root, "search", { query: q }); else filterList(box, q);
      hl = opts(box).find(visible) || null; highlight(box, hl, input);
    });
    b.on(input, "keydown", (e) => {
      const k = e.key;
      if (k === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); }
      const n = step(box, hl, k);
      if (n !== undefined && open && !(k === "Home" || k === "End")) { e.preventDefault(); hl = n; highlight(box, hl, input); return; }
      if (k === "Enter" && open) { e.preventDefault(); if (hl) commit(hl.dataset.value); else if (allowCustom && input.value.trim()) commit(input.value.trim()); }
      if (k === "Escape" && !open && input.value) { input.value = ""; filterList(box, ""); }
      if (k === "Backspace" && !input.value && sel.multiple && sel.values.length) { commit(sel.values[sel.values.length - 1]); }
    });
    trigger && b.on(trigger, "click", () => { if (!remote) filterList(box, ""); setOpen(!open); input.focus(); });
    b.on(box, "pointerdown", (e) => e.preventDefault()); // keep focus in input
    b.on(box, "click", (e) => { const x = e.target.closest('[data-ui-part="option"]'); if (x && visible(x)) commit(x.dataset.value); });
    b.on(root, "click", (e) => { const r = e.target.closest('[data-ui-part="chip-remove"]'); if (r) commit(r.parentElement.dataset.value); });
    if (!sel.multiple && sel.values[0]) input.value = textFor(sel.values[0]);
    render();
    return { get value() { return sel.multiple ? sel.values : sel.values[0] ?? null; }, set value(v) { sel.set([].concat(v ?? [])); render(); }, refresh() { wireList(box, id, sel.multiple); if (!remote) filterList(box, input.value); render(); }, destroy() { unlayer?.(); b.off(); } };
  });
}

export function createCommand(root, o = {}) {
  return once(root, "__uiCommand", () => {
    const b = bag(), id = root.id || uid("ui-command");
    const input = parts(root, "input")[0], list = parts(root, "list")[0];
    wireList(list, id, false);
    input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "true"); input.setAttribute("aria-controls", list.id); input.setAttribute("aria-autocomplete", "list"); input.autocomplete = "off";
    let hl = null;
    const reset = () => { filterList(list, input.value); hl = opts(list).find(visible) || null; highlight(list, hl, input); };
    const pick = (x) => { if (!x || !visible(x)) return; o.onSelect?.(x.dataset.value, x); emit(root, "select", { value: x.dataset.value, option: x }); };
    b.on(input, "input", () => { reset(); emit(root, "search", { query: input.value }); });
    b.on(input, "keydown", (e) => {
      const n = step(list, hl, e.key);
      if (n !== undefined && !(e.key === "Home" || e.key === "End")) { e.preventDefault(); hl = n; highlight(list, hl, input); }
      if (e.key === "Enter") { e.preventDefault(); pick(hl); }
    });
    b.on(list, "click", (e) => pick(e.target.closest('[data-ui-part="option"]')));
    b.on(list, "pointermove", (e) => { const x = e.target.closest('[data-ui-part="option"]'); if (x && x !== hl && visible(x)) { hl = x; highlight(list, hl, input); } });
    // optional global hotkey (Cmd/Ctrl + key) → opens nearest dialog ancestor + focuses input
    const hk = root.dataset.hotkey;
    if (hk) b.on(root.ownerDocument, "keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === hk.toLowerCase()) {
        e.preventDefault(); const d = root.closest('[data-ui="dialog"]'); d?.__uiDialog?.show(); input.value = ""; reset(); input.focus();
      }
    });
    reset();
    return { refresh: () => { wireList(list, id, false); reset(); }, get query() { return input.value; }, destroy: b.off };
  });
}
