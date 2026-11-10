// Colibri UI form primitives. Native form elements stay the source of truth (they post with plain forms).
import { uid, parts, part, emit, setState, btn, once, bag, isDisabled } from "./util.js";

/* Field (shadcn Field/Label, Metronic Input wrapper): wires label/description/error to the control.
   <div data-ui="field" [data-invalid]><label data-ui-part="label">Name</label>
     <input data-ui-part="control"> <p data-ui-part="description">…</p> <p data-ui-part="error">…</p></div>
   api.setError("msg"|null)  → aria-invalid, data-invalid, error[hidden]. Native validity → error on blur if data-validate. */
export function createField(root, o = {}) {
  return once(root, "__uiField", () => {
    const b = bag(), id = root.id || uid("ui-field");
    const control = part(root, "control") || root.querySelector("input,select,textarea");
    const lab = part(root, "label"), desc = part(root, "description"), err = part(root, "error");
    if (!control) return { destroy() {} };
    control.id ||= `${id}-control`;
    if (lab) { if (lab.tagName === "LABEL") lab.htmlFor = control.id; else { lab.id ||= `${id}-label`; control.setAttribute("aria-labelledby", lab.id); } }
    const describe = () => control.setAttribute("aria-describedby", [desc, err && !err.hidden ? err : null].filter(Boolean).map((e) => (e.id ||= `${id}-${e.dataset.uiPart}`)).join(" "));
    const setError = (msg) => {
      const bad = !!msg; root.toggleAttribute("data-invalid", bad); control.setAttribute("aria-invalid", String(bad));
      if (err) { if (typeof msg === "string") err.textContent = msg; err.hidden = !bad; err.setAttribute("role", "alert"); }
      describe(); emit(root, "validate", { valid: !bad, message: msg || null });
    };
    if (control.required) lab?.setAttribute("data-required", "");
    if (root.hasAttribute("data-validate")) {
      b.on(control, "blur", () => setError(control.validity.valid ? null : control.validationMessage));
      b.on(control, "input", () => root.hasAttribute("data-invalid") && control.validity.valid && setError(null));
    }
    setError(root.hasAttribute("data-invalid") ? (err?.textContent || true) : null);
    return { setError, control, destroy: b.off };
  });
}

/* Slider (shadcn Slider, Metronic Slider): single or range, keyboard + pointer, hidden inputs.
   <div data-ui="slider" data-min="0" data-max="100" data-step="1" data-value="20,80" data-name="price" [data-orientation=vertical]>
     <div data-ui-part="track"><div data-ui-part="range"></div></div>
     <span data-ui-part="thumb" aria-label="Min"></span><span data-ui-part="thumb" aria-label="Max"></span></div>
   Exposes CSS vars --ui-slider-start / --ui-slider-end (0–100%) and each thumb --ui-slider-pos for positioning. */
export function createSlider(root, o = {}) {
  return once(root, "__uiSlider", () => {
    const b = bag(); const num = (k, d) => Number(o[k] ?? root.dataset[k] ?? d);
    const min = num("min", 0), max = num("max", 100), step = num("step", 1), vertical = root.dataset.orientation === "vertical";
    const name = root.dataset.name, minGap = num("minStepsBetween", 0) * step;
    const thumbs = parts(root, "thumb"), track = part(root, "track") || root, range = part(root, "range");
    let values = String(o.value ?? root.dataset.value ?? min).split(",").map(Number).slice(0, thumbs.length || 1);
    const clamp = (v) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
    const pct = (v) => ((v - min) / (max - min)) * 100;
    const inputs = values.map((_, i) => { if (!name) return null; const h = root.ownerDocument.createElement("input"); h.type = "hidden"; h.name = name; root.append(h); return h; });
    thumbs.forEach((t, i) => { t.setAttribute("role", "slider"); t.tabIndex = isDisabled(root) ? -1 : 0; t.setAttribute("aria-valuemin", min); t.setAttribute("aria-valuemax", max); t.setAttribute("aria-orientation", vertical ? "vertical" : "horizontal"); });
    const render = () => {
      thumbs.forEach((t, i) => { t.setAttribute("aria-valuenow", values[i]); t.setAttribute("aria-valuetext", t.dataset.format ? t.dataset.format.replace("{v}", values[i]) : values[i]); t.style.setProperty("--ui-slider-pos", `${pct(values[i])}%`); });
      const s = values.length > 1 ? pct(values[0]) : 0, e = pct(values[values.length - 1]);
      root.style.setProperty("--ui-slider-start", `${s}%`); root.style.setProperty("--ui-slider-end", `${e}%`);
      if (range) range.style.setProperty("--ui-slider-start", `${s}%`), range.style.setProperty("--ui-slider-end", `${e}%`);
      inputs.forEach((h, i) => h && (h.value = values[i])); root.dataset.value = values.join(",");
    };
    const setAt = (i, v, commit) => {
      v = clamp(v);
      if (values.length > 1) { if (i > 0) v = Math.max(v, values[i - 1] + minGap); if (i < values.length - 1) v = Math.min(v, values[i + 1] - minGap); }
      if (values[i] === v) return; values[i] = v; render();
      const out = values.length > 1 ? [...values] : values[0];
      o.onValueChange?.(out); emit(root, "input", { value: out }); if (commit) emit(root, "change", { value: out });
    };
    const fromPointer = (e) => { const r = track.getBoundingClientRect(); const f = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; return min + Math.min(1, Math.max(0, f)) * (max - min); };
    let drag = -1;
    b.on(root, "pointerdown", (e) => {
      if (isDisabled(root) || e.button !== 0) return; const v = fromPointer(e);
      drag = values.length > 1 ? (Math.abs(v - values[0]) <= Math.abs(v - values[1]) ? 0 : 1) : 0;
      root.setPointerCapture?.(e.pointerId); setAt(drag, v); thumbs[drag]?.focus(); setState(root, "dragging"); e.preventDefault();
    });
    b.on(root, "pointermove", (e) => drag >= 0 && setAt(drag, fromPointer(e)));
    b.on(root, "pointerup", () => { if (drag >= 0) { emit(root, "change", { value: values.length > 1 ? [...values] : values[0] }); drag = -1; setState(root, "idle"); } });
    thumbs.forEach((t, i) => b.on(t, "keydown", (e) => {
      const big = Math.max(step, (max - min) / 10); const m = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big };
      if (e.key in m) { e.preventDefault(); setAt(i, values[i] + m[e.key] * (e.shiftKey ? 10 : 1), true); }
      else if (e.key === "Home") { e.preventDefault(); setAt(i, min, true); } else if (e.key === "End") { e.preventDefault(); setAt(i, max, true); }
    }));
    render();
    return { get value() { return values.length > 1 ? [...values] : values[0]; }, set value(v) { [].concat(v).forEach((x, i) => setAt(i, x, true)); }, destroy: b.off };
  });
}

/* PinInput / InputOTP (shadcn InputOTP, Metronic Pin Input)
   <div data-ui="pin-input" data-length="6" data-name="otp" [data-type="numeric|alphanumeric"] [data-mask]>
     <input data-ui-part="cell"> ×N   (or omit cells: they are generated)</div>
   Paste fills all cells; Backspace moves back; ui:complete {value} when full. */
export function createPinInput(root, o = {}) {
  return once(root, "__uiPinInput", () => {
    const b = bag(), doc = root.ownerDocument, len = Number(o.length ?? root.dataset.length ?? 6);
    const numeric = (root.dataset.type || "numeric") === "numeric", name = root.dataset.name;
    let cells = parts(root, "cell");
    if (!cells.length) for (let i = 0; i < len; i++) { const c = doc.createElement("input"); c.dataset.uiPart = "cell"; root.append(c); }
    cells = parts(root, "cell");
    root.setAttribute("role", "group");
    const hidden = name ? Object.assign(doc.createElement("input"), { type: "hidden", name }) : null; hidden && root.append(hidden);
    cells.forEach((c, i) => {
      c.maxLength = 1; c.autocomplete = i === 0 ? "one-time-code" : "off"; c.inputMode = numeric ? "numeric" : "text";
      if (root.hasAttribute("data-mask")) c.type = "password";
      c.setAttribute("aria-label", `${root.dataset.label || "Digit"} ${i + 1} / ${cells.length}`);
    });
    const ok = (ch) => (numeric ? /^\d$/ : /^[a-z0-9]$/i).test(ch);
    const value = () => cells.map((c) => c.value).join("");
    const sync = () => { const v = value(); if (hidden) hidden.value = v; root.dataset.value = v; cells.forEach((c) => setState(c, c.value ? "filled" : "empty")); emit(root, "change", { value: v }); if (v.length === cells.length) { o.onComplete?.(v); emit(root, "complete", { value: v }); } };
    const fill = (from, text) => { let i = from; for (const ch of text) { if (i >= cells.length) break; if (ok(ch)) cells[i++].value = ch; } cells[Math.min(i, cells.length - 1)].focus(); sync(); };
    cells.forEach((c, i) => {
      b.on(c, "input", () => { const v = c.value; c.value = ""; if (v.length > 1) return fill(i, v); if (ok(v)) { c.value = v; cells[i + 1]?.focus(); } sync(); });
      b.on(c, "keydown", (e) => {
        if (e.key === "Backspace" && !c.value && i > 0) { e.preventDefault(); cells[i - 1].value = ""; cells[i - 1].focus(); sync(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); cells[i - 1]?.focus(); } else if (e.key === "ArrowRight") { e.preventDefault(); cells[i + 1]?.focus(); }
      });
      b.on(c, "paste", (e) => { e.preventDefault(); fill(i, (e.clipboardData || doc.defaultView.clipboardData).getData("text")); });
      b.on(c, "focus", () => c.select());
    });
    return { get value() { return value(); }, clear() { cells.forEach((c) => (c.value = "")); sync(); cells[0].focus(); }, destroy: b.off };
  });
}

/* TogglePassword (Metronic): <div data-ui="toggle-password"><input type="password" data-ui-part="input"><button data-ui-part="toggle" aria-label="Show password"></button></div> */
export function createTogglePassword(root) {
  return once(root, "__uiTogglePassword", () => {
    const b = bag(), input = part(root, "input") || root.querySelector("input"), t = btn(part(root, "toggle"));
    t.setAttribute("aria-controls", input.id ||= uid("ui-pw"));
    const render = () => { const shown = input.type === "text"; t.setAttribute("aria-pressed", String(shown)); setState(root, shown ? "visible" : "hidden"); };
    b.on(t, "click", () => { input.type = input.type === "password" ? "text" : "password"; render(); emit(root, "change", { visible: input.type === "text" }); input.focus(); });
    render(); return { destroy: b.off };
  });
}

/* FileInput (Metronic File Input, shadcn Attachment-ish): dropzone + list over a native <input type=file>.
   <div data-ui="file-input"><input type="file" data-ui-part="input" multiple [accept] [data-max-size="2MB"]>
     <div data-ui-part="dropzone">Drop files</div> <ul data-ui-part="list"></ul></div>
   Items render as <li data-ui-part="file"><span data-ui-part="name"> <span data-ui-part="size"> <button data-ui-part="remove">. */
const sizeOf = (s) => { const m = /^([\d.]+)\s*(KB|MB|GB)?$/i.exec(s || ""); return m ? Number(m[1]) * ({ KB: 1e3, MB: 1e6, GB: 1e9 }[(m[2] || "").toUpperCase()] || 1) : Infinity; };
const fmt = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} KB`);
export function createFileInput(root, o = {}) {
  return once(root, "__uiFileInput", () => {
    const b = bag(), doc = root.ownerDocument, input = part(root, "input"), dz = part(root, "dropzone"), list = part(root, "list");
    const max = sizeOf(input.dataset.maxSize || root.dataset.maxSize);
    let files = [];
    const commit = () => {
      try { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); input.files = dt.files; } catch { /* older browsers: list only */ }
      if (list) list.innerHTML = "";
      files.forEach((f, i) => { if (!list) return; const li = doc.createElement("li"); li.dataset.uiPart = "file"; li.dataset.index = i; li.innerHTML = `<span data-ui-part="name"></span> <span data-ui-part="size">${fmt(f.size)}</span> <button type="button" data-ui-part="remove" aria-label="Remove">×</button>`; li.firstChild.textContent = f.name; list.append(li); });
      setState(root, files.length ? "filled" : "empty"); emit(root, "change", { files: [...files] });
    };
    const add = (fl) => {
      const rejected = [];
      for (const f of fl) { if (f.size > max) { rejected.push({ file: f, reason: "size" }); continue; } if (input.accept && !input.accept.split(",").some((a) => (a = a.trim()) && (a.startsWith(".") ? f.name.toLowerCase().endsWith(a.toLowerCase()) : f.type.match(new RegExp("^" + a.replace("*", ".*")))))) { rejected.push({ file: f, reason: "type" }); continue; } files = input.multiple ? [...files, f] : [f]; }
      if (rejected.length) emit(root, "reject", { files: rejected }); commit();
    };
    b.on(input, "change", (e) => { if (e.isTrusted !== false) { const fl = [...input.files]; files = input.multiple ? files : []; add(fl); } });
    if (dz) {
      dz.tabIndex = 0; dz.setAttribute("role", "button");
      b.on(dz, "click", () => input.click()); b.on(dz, "keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click()));
      b.on(dz, "dragover", (e) => { e.preventDefault(); setState(dz, "over"); }); b.on(dz, "dragleave", () => setState(dz, "idle"));
      b.on(dz, "drop", (e) => { e.preventDefault(); setState(dz, "idle"); add([...e.dataTransfer.files]); });
    }
    list && b.on(list, "click", (e) => { const r = e.target.closest('[data-ui-part="remove"]'); if (r) { files.splice(Number(r.closest("li").dataset.index), 1); commit(); } });
    setState(root, "empty");
    return { get files() { return [...files]; }, clear() { files = []; commit(); }, destroy: b.off };
  });
}

/* ImageInput (Metronic): avatar/image with change + remove, preview via object URL.
   <div data-ui="image-input" [data-default-src]><img data-ui-part="preview"><input type="file" accept="image/*" data-ui-part="input">
     <button data-ui-part="change">Change</button><button data-ui-part="remove">Remove</button>
     <input type="hidden" data-ui-part="removed" name="avatar_remove"></div> */
export function createImageInput(root) {
  return once(root, "__uiImageInput", () => {
    const b = bag(), img = part(root, "preview"), input = part(root, "input"), removed = part(root, "removed");
    const def = root.dataset.defaultSrc || img?.getAttribute("src") || ""; let url = null;
    const set = (src, state) => { if (img) { if (src) img.src = src; else img.removeAttribute("src"); } setState(root, state); };
    b.on(part(root, "change") || root, "click", (e) => { if (e.currentTarget !== root) input.click(); });
    b.on(input, "change", () => { const f = input.files[0]; if (!f) return; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(f); set(url, "changed"); if (removed) removed.value = ""; emit(root, "change", { file: f }); });
    const rm = part(root, "remove");
    rm && b.on(rm, "click", () => { input.value = ""; if (url) URL.revokeObjectURL(url); url = null; set(root.dataset.placeholderSrc || "", "empty"); if (removed) removed.value = "1"; emit(root, "remove"); });
    [part(root, "change"), rm].forEach(btn);
    set(def, def ? "filled" : "empty");
    return { destroy() { b.off(); if (url) URL.revokeObjectURL(url); } };
  });
}

/* Repeater (Metronic): repeatable form rows from a <template>, with index renumbering for Spring binding.
   <div data-ui="repeater" data-min="1" data-max="10">
     <template data-ui-part="template"><div data-ui-part="row"><input name="items[__i__].name"><button data-ui-part="remove">−</button></div></template>
     <div data-ui-part="list"></div><button data-ui-part="add">+ Add</button></div> */
export function createRepeater(root, o = {}) {
  return once(root, "__uiRepeater", () => {
    const b = bag(), tpl = part(root, "template"), list = part(root, "list") || root, addBtn = btn(part(root, "add"));
    const min = Number(root.dataset.min ?? 0), max = Number(root.dataset.max ?? Infinity);
    const rows = () => [...list.querySelectorAll(':scope > [data-ui-part="row"]')];
    const renumber = () => {
      rows().forEach((r, i) => { r.dataset.index = i; r.querySelectorAll("[name],[id],[for]").forEach((el) => ["name", "id", "for"].forEach((a) => { const v = el.getAttribute(a); if (v) el.setAttribute(a, v.replace(/\[\d+\]|__i__/g, (m) => (m === "__i__" ? String(i) : `[${i}]`))); })); });
      const n = rows().length; if (addBtn) addBtn.disabled = n >= max; rows().forEach((r) => { const rm = r.querySelector('[data-ui-part="remove"]'); if (rm) rm.disabled = n <= min; });
      root.dataset.count = n;
    };
    const add = () => { if (rows().length >= max) return; const node = tpl.content.firstElementChild.cloneNode(true); list.append(node); node.querySelectorAll('[data-ui-part="remove"]').forEach(btn); renumber(); if (root.contains(root.ownerDocument.activeElement)) node.querySelector("input,select,textarea")?.focus(); emit(root, "add", { row: node, index: rows().length - 1 }); root.ownerDocument.dispatchEvent(new CustomEvent("ui:refresh", { bubbles: true })); };
    addBtn && b.on(addBtn, "click", add);
    b.on(root, "click", (e) => { const r = e.target.closest('[data-ui-part="remove"]'); if (!r) return; const row = r.closest('[data-ui-part="row"]'); if (rows().length <= min) return; row.remove(); renumber(); emit(root, "remove", { row }); });
    while (rows().length < min) add();
    renumber();
    return { add, get count() { return rows().length; }, destroy: b.off };
  });
}

/* Rating (Metronic Rating): radio-based, keyboard via native radios; read-only mode.
   <div data-ui="rating" data-name="stars" data-max="5" [data-value="3"] [data-readonly]></div>  (items generated)
   Each generated <label data-ui-part="item" data-state="on|off"> wraps a visually-your-choice radio. */
export function createRating(root, o = {}) {
  return once(root, "__uiRating", () => {
    const b = bag(), doc = root.ownerDocument, max = Number(root.dataset.max ?? 5), name = root.dataset.name || uid("ui-rating"), ro = root.hasAttribute("data-readonly");
    let value = Number(root.dataset.value ?? 0), hover = 0;
    if (!parts(root, "item").length) for (let i = 1; i <= max; i++) {
      const l = doc.createElement("label"); l.dataset.uiPart = "item"; l.dataset.value = i;
      l.innerHTML = `<input type="radio" value="${i}" aria-label="${i} / ${max}"${ro ? " disabled" : ""}><span data-ui-part="icon" aria-hidden="true">★</span>`;
      l.querySelector("input").name = name;
      root.append(l);
    }
    root.setAttribute("role", "radiogroup"); if (ro) root.setAttribute("aria-readonly", "true");
    const items = () => parts(root, "item");
    const render = () => { items().forEach((l) => { const v = Number(l.dataset.value); setState(l, v <= (hover || value) ? "on" : "off"); l.querySelector("input").checked = v === value; }); root.dataset.value = value; };
    b.on(root, "change", (e) => { if (e.target.name === name) { value = Number(e.target.value); render(); emit(root, "change", { value }); } });
    if (!ro) { b.on(root, "pointerover", (e) => { const l = e.target.closest('[data-ui-part="item"]'); if (l) { hover = Number(l.dataset.value); render(); } }); b.on(root, "pointerleave", () => { hover = 0; render(); }); }
    render(); return { get value() { return value; }, destroy: b.off };
  });
}

/* Textarea autosize: <textarea data-ui="textarea" data-autosize [data-max-rows]> ; also counts chars → data-count */
export function createTextarea(root) {
  return once(root, "__uiTextarea", () => {
    const b = bag(), max = Number(root.dataset.maxRows || 0);
    const fit = () => {
      if (root.hasAttribute("data-autosize")) { root.style.height = "auto"; const lh = parseFloat(getComputedStyle(root).lineHeight) || 20; const h = root.scrollHeight; root.style.height = `${max ? Math.min(h, lh * max + 16) : h}px`; root.style.overflowY = max && h > lh * max + 16 ? "auto" : "hidden"; }
      root.dataset.count = root.value.length; if (root.maxLength > 0) root.dataset.remaining = root.maxLength - root.value.length;
    };
    b.on(root, "input", fit); fit(); return { fit, destroy: b.off };
  });
}

/* ColorPicker (Metronic): native <input type=color> + text field kept in sync + swatches.
   <div data-ui="color-picker" data-name="brand"><input type="color" data-ui-part="input"><input data-ui-part="text">
     <button data-ui-part="swatch" data-value="#e11d48"></button>…</div> */
export function createColorPicker(root) {
  return once(root, "__uiColorPicker", () => {
    const b = bag(), color = part(root, "input"), text = part(root, "text");
    const set = (v) => { if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return false; if (v.length === 4) v = "#" + [...v.slice(1)].map((c) => c + c).join(""); color.value = v.toLowerCase(); if (text) text.value = v.toLowerCase(); root.style.setProperty("--ui-color", v); root.dataset.value = v; parts(root, "swatch").forEach((s) => { s.setAttribute("aria-pressed", String(s.dataset.value.toLowerCase() === v.toLowerCase())); }); emit(root, "change", { value: v }); return true; };
    b.on(color, "input", () => set(color.value));
    text && b.on(text, "change", () => { if (!set(text.value.trim())) text.setAttribute("aria-invalid", "true"); else text.removeAttribute("aria-invalid"); });
    parts(root, "swatch").forEach((s) => { btn(s); s.setAttribute("aria-label", s.getAttribute("aria-label") || s.dataset.value); s.style.setProperty("--ui-swatch", s.dataset.value); });
    b.on(root, "click", (e) => { const s = e.target.closest('[data-ui-part="swatch"]'); if (s) set(s.dataset.value); });
    set(color.value || "#000000"); return { get value() { return color.value; }, set value(v) { set(v); }, destroy: b.off };
  });
}

/* Sortable (Metronic): pointer drag + keyboard (Space to lift, arrows to move, Space to drop).
   <ul data-ui="sortable" [data-handle]><li data-ui-part="item" data-value="a">…<span data-ui-part="handle">⋮⋮</span></li>…</ul>
   Live region announces moves. ui:sort {order:[values]}. Optional hidden input data-name posts comma order. */
export function createSortable(root, o = {}) {
  return once(root, "__uiSortable", () => {
    const b = bag(), doc = root.ownerDocument, useHandle = root.hasAttribute("data-handle");
    const items = () => parts(root, "item");
    const live = doc.createElement("div"); live.setAttribute("aria-live", "assertive"); live.dataset.uiPart = "announcer";
    Object.assign(live.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }); root.after(live);
    const name = root.dataset.name; const hidden = name ? Object.assign(doc.createElement("input"), { type: "hidden", name }) : null; hidden && root.after(hidden);
    const order = () => items().map((i) => i.dataset.value);
    const done = () => { if (hidden) hidden.value = order().join(","); o.onSort?.(order()); emit(root, "sort", { order: order() }); };
    const grabbable = (i) => (useHandle ? i.querySelector('[data-ui-part="handle"]') : i);
    items().forEach((i) => { const g = grabbable(i); g.tabIndex = 0; g.setAttribute("aria-roledescription", "sortable"); g.setAttribute("aria-label", g.getAttribute("aria-label") || `${(i.dataset.label || i.textContent).trim()} — Space to move`); });
    let lifted = null, drag = null;
    b.on(root, "keydown", (e) => {
      const it = e.target.closest('[data-ui-part="item"]'); if (!it || grabbable(it) !== e.target) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (lifted) { setState(lifted, "idle"); live.textContent = `Dropped at position ${items().indexOf(lifted) + 1}`; lifted = null; done(); } else { lifted = it; setState(it, "lifted"); live.textContent = `Lifted ${(it.dataset.label || it.textContent).trim()}. Use arrow keys, Space to drop, Escape to cancel.`; it._from = items().indexOf(it); } }
      else if (lifted && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); const sib = e.key === "ArrowDown" ? lifted.nextElementSibling : lifted.previousElementSibling; if (sib?.dataset.uiPart === "item") { e.key === "ArrowDown" ? sib.after(lifted) : sib.before(lifted); grabbable(lifted).focus(); live.textContent = `Position ${items().indexOf(lifted) + 1} of ${items().length}`; } }
      else if (lifted && e.key === "Escape") { const ref = items()[lifted._from]; if (ref && ref !== lifted) (lifted._from > items().indexOf(lifted) ? ref.after(lifted) : ref.before(lifted)); setState(lifted, "idle"); grabbable(lifted).focus(); lifted = null; live.textContent = "Move cancelled"; }
    });
    b.on(root, "pointerdown", (e) => { const it = e.target.closest('[data-ui-part="item"]'); if (!it || (useHandle && !e.target.closest('[data-ui-part="handle"]')) || e.button !== 0) return; drag = it; setState(it, "dragging"); root.setPointerCapture?.(e.pointerId); e.preventDefault(); });
    b.on(root, "pointermove", (e) => { if (!drag) return; const over = doc.elementFromPoint(e.clientX, e.clientY)?.closest('[data-ui-part="item"]'); if (over && over !== drag && root.contains(over)) { const r = over.getBoundingClientRect(); (e.clientY > r.top + r.height / 2 ? over.after(drag) : over.before(drag)); } });
    b.on(root, "pointerup", () => { if (drag) { setState(drag, "idle"); drag = null; done(); } });
    if (hidden) hidden.value = order().join(",");
    return { get order() { return order(); }, destroy() { b.off(); live.remove(); } };
  });
}
