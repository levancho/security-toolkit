// Small DOM helpers shared by the app and the toolkit.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

let toastTimer;
export function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2600);
}

export async function copyText(text, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.className = 'offscreen';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(`${what} to clipboard`);
}

/** Render a QR code for `text` onto a canvas element. */
export function drawQr(canvas, text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(232 / (n + 4)));
  const size = cell * (n + 4);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0b1220';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) ctx.fillRect((c + 2) * cell, (r + 2) * cell, cell, cell);
  }
}

export function fmtDate(ts) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}
export function fmtRelative(ts) {
  const s = Math.round((ts - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 90) return rtf.format(Math.round(s / 1), 'second');
  if (abs < 5400) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 129600) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
