// Colibri UI: Calendar (shadcn Calendar) + DatePicker (shadcn Date Picker, Metronic Date Picker).
// Pure DOM grid with ARIA grid semantics; Intl for month/weekday names (Georgian works: data-locale="ka").
//  <div data-ui="calendar" data-mode="single|range|multiple" [data-value="2026-10-30"] [data-min] [data-max]
//       [data-locale="ka"] [data-week-start="1"] [data-months="1|2"]></div>   (markup generated inside)
//  Generated parts: header(prev,title,next) + grid(table[role=grid]) + day buttons
//    day: data-ui-part="day" data-date="YYYY-MM-DD" + data-today/data-outside/data-selected/data-range-start|middle|end/data-disabled
//  <div data-ui="date-picker" data-name="published" [data-mode]>
//     <input data-ui-part="input" placeholder="YYYY-MM-DD"> <button data-ui-part="trigger">📅</button>
//     <div data-ui-part="content" hidden><div data-ui="calendar"></div></div></div>
import { uid, part, emit, setState, btn, once, bag, place, layer } from "./util.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));

export function createCalendar(root, o = {}) {
  return once(root, "__uiCalendar", () => {
    const b = bag(), doc = root.ownerDocument, id = root.id || uid("ui-cal");
    const mode = o.mode || root.dataset.mode || "single", locale = o.locale || root.dataset.locale || doc.documentElement.lang || "en";
    const ws = Number(root.dataset.weekStart ?? 1), months = Number(root.dataset.months ?? 1);
    const min = parse(root.dataset.min), max = parse(root.dataset.max);
    const disabledDays = (root.dataset.disabledWeekdays || "").split(",").filter(Boolean).map(Number);
    let sel = String(o.value ?? root.dataset.value ?? "").split(",").map(parse).filter(Boolean);
    let focus = sel[0] || new Date(); let view = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const fmtTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    const fmtDay = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const fmtFull = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
    const isDis = (d) => (min && d < min) || (max && d > max) || disabledDays.includes(d.getDay()) || o.isDisabled?.(d);
    const same = (a, c) => a && c && iso(a) === iso(c);
    root.setAttribute("role", "application"); root.setAttribute("aria-roledescription", "calendar");
    root.innerHTML = `<div data-ui-part="header"><button type="button" data-ui-part="prev" aria-label="Previous month">‹</button><div data-ui-part="title" aria-live="polite"></div><button type="button" data-ui-part="next" aria-label="Next month">›</button></div><div data-ui-part="months"></div>`;
    const title = part(root, "title"), monthsEl = part(root, "months");
    title.id = `${id}-title`;
    function render(focusDay) {
      title.textContent = Array.from({ length: months }, (_, i) => fmtTitle.format(addM(view, i))).join(" – ");
      monthsEl.innerHTML = "";
      for (let m = 0; m < months; m++) {
        const first = addM(view, m), start = add(first, -((first.getDay() - ws + 7) % 7));
        const t = doc.createElement("table"); t.setAttribute("role", "grid"); t.setAttribute("aria-labelledby", `${id}-title`); t.dataset.uiPart = "grid";
        const head = Array.from({ length: 7 }, (_, i) => { const d = add(start, i); return `<th scope="col" abbr="${new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d)}">${fmtDay.format(d)}</th>`; }).join("");
        let rows = "";
        for (let w = 0; w < 6; w++) {
          rows += "<tr>";
          for (let i = 0; i < 7; i++) {
            const d = add(start, w * 7 + i), out = d.getMonth() !== first.getMonth();
            const a = []; if (same(d, new Date())) a.push("data-today"); if (out) a.push("data-outside"); if (isDis(d)) a.push('data-disabled aria-disabled="true"');
            let selected = sel.some((s) => same(s, d));
            if (mode === "range" && sel.length === 2) { const [x, y] = sel; if (d > x && d < y) { a.push("data-range-middle"); selected = true; } if (same(d, x)) a.push("data-range-start"); if (same(d, y)) a.push("data-range-end"); }
            if (selected) a.push('data-selected aria-selected="true"');
            rows += `<td role="gridcell"><button type="button" data-ui-part="day" data-date="${iso(d)}" tabindex="${same(d, focus) ? 0 : -1}" aria-label="${fmtFull.format(d)}" ${a.join(" ")}>${d.getDate()}</button></td>`;
          }
          rows += "</tr>";
        }
        t.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody>`;
        monthsEl.append(t);
      }
      root.dataset.value = sel.map(iso).join(",");
      if (focusDay) root.querySelector(`[data-date="${iso(focus)}"]`)?.focus();
    }
    const move = (d) => { focus = d; const last = addM(view, months - 1); if (d < view || d >= addM(last, 1)) view = new Date(d.getFullYear(), d.getMonth() - (d < view ? 0 : months - 1), 1); render(true); };
    function pick(d) {
      if (isDis(d)) return;
      if (mode === "single") sel = same(sel[0], d) && o.allowDeselect ? [] : [d];
      else if (mode === "multiple") sel = sel.some((s) => same(s, d)) ? sel.filter((s) => !same(s, d)) : [...sel, d];
      else sel = sel.length !== 1 ? [d] : d < sel[0] ? [d, sel[0]] : [sel[0], d];
      focus = d; render(true);
      const value = mode === "single" ? (sel[0] ? iso(sel[0]) : null) : sel.map(iso);
      o.onSelect?.(value); emit(root, "change", { value, complete: mode !== "range" || sel.length === 2 });
    }
    b.on(root, "click", (e) => {
      if (e.target.closest('[data-ui-part="prev"]')) { view = addM(view, -1); focus = addM(focus, -1); render(); }
      else if (e.target.closest('[data-ui-part="next"]')) { view = addM(view, 1); focus = addM(focus, 1); render(); }
      else { const d = e.target.closest('[data-ui-part="day"]'); if (d) pick(parse(d.dataset.date)); }
    });
    b.on(root, "keydown", (e) => {
      if (!e.target.closest('[data-ui-part="day"]')) return;
      const k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (k) { e.preventDefault(); return move(add(focus, k)); }
      if (e.key === "PageUp") { e.preventDefault(); return move(e.shiftKey ? addM(focus, -12) : addM(focus, -1)); }
      if (e.key === "PageDown") { e.preventDefault(); return move(e.shiftKey ? addM(focus, 12) : addM(focus, 1)); }
      if (e.key === "Home") { e.preventDefault(); return move(add(focus, -((focus.getDay() - ws + 7) % 7))); }
      if (e.key === "End") { e.preventDefault(); return move(add(focus, 6 - ((focus.getDay() - ws + 7) % 7))); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(focus); }
    });
    render();
    return { get value() { return mode === "single" ? (sel[0] ? iso(sel[0]) : null) : sel.map(iso); },
      set value(v) { sel = [].concat(v ?? []).map(parse).filter(Boolean); if (sel[0]) { focus = sel[0]; view = new Date(focus.getFullYear(), focus.getMonth(), 1); } render(); },
      focus: () => render(true), destroy: b.off };
  });
}

export function createDatePicker(root, o = {}) {
  return once(root, "__uiDatePicker", () => {
    const b = bag(), input = part(root, "input"), trigger = btn(part(root, "trigger")), content = part(root, "content");
    const calEl = content.querySelector('[data-ui="calendar"]'); const mode = root.dataset.mode || "single";
    if (mode) calEl.dataset.mode = mode;
    if (input?.value) calEl.dataset.value = input.value.replace(/\s*–\s*/g, ",");
    if (root.dataset.name && input) input.name ||= root.dataset.name;
    const cal = createCalendar(calEl, o); content.hidden = true; content.setAttribute("role", "dialog"); content.setAttribute("aria-modal", "false");
    trigger?.setAttribute("aria-haspopup", "dialog"); trigger?.setAttribute("aria-expanded", "false");
    let open = false, unlayer = null;
    const set = (v) => { if (v === open) return; open = v; content.hidden = !open; trigger?.setAttribute("aria-expanded", String(open)); [root, content].forEach((e) => setState(e, open ? "open" : "closed"));
      if (open) { place(content, input || trigger, { side: "bottom", align: "start" }); unlayer = layer(content, () => { set(false); (trigger || input).focus(); }, { ignore: [trigger, input] }); cal.focus(); } else { unlayer?.(); unlayer = null; }
      emit(root, open ? "open" : "close"); };
    trigger && b.on(trigger, "click", () => set(!open));
    input && b.on(input, "keydown", (e) => { if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); set(true); } });
    input && b.on(input, "change", () => { cal.value = input.value.split(/\s*[–,]\s*/); emit(root, "change", { value: cal.value }); });
    b.on(calEl, "ui:change", (e) => { e.stopPropagation(); const v = e.detail.value; if (input) input.value = Array.isArray(v) ? v.join(" – ") : v || ""; emit(root, "change", { value: v }); if (e.detail.complete && mode !== "multiple") { set(false); (trigger || input)?.focus(); } });
    return { get value() { return cal.value; }, set value(v) { cal.value = v; if (input) input.value = [].concat(v).join(" – "); }, show: () => set(true), hide: () => set(false), destroy() { unlayer?.(); b.off(); cal.destroy(); } };
  });
}
