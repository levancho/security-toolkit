// VaultDrop security toolkit. Every tool runs entirely in the browser.
import { $, $$, esc, toast, copyText, drawQr, fmtDate, fmtRelative, icon, tip, setCallout } from './ui.js';
import { utf8, fromUtf8, toB64, fromB64, toB64u, fromB64u, toHex, randomBytes, randomInt } from './crypto.js';

let wordlistPromise;
export function loadWordlist() {
  wordlistPromise ||= fetch('/vendor/eff-wordlist.json').then((r) => r.json());
  return wordlistPromise;
}
const pushIt = (text) => document.dispatchEvent(new CustomEvent('vd:push', { detail: text }));

// ------------------------------------------------------------ generator --
const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
};
const AMBIGUOUS = /[Il1O0o|`'"]/g;

export function generatePassword(len, opts) {
  const sets = Object.keys(SETS).filter((k) => opts[k]).map((k) => (opts.noAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
  if (!sets.length) return { value: '', bits: 0 };
  const pool = sets.join('');
  let value;
  do {
    value = Array.from({ length: len }, () => pool[randomInt(pool.length)]).join('');
  } while (len >= sets.length && !sets.every((s) => [...value].some((c) => s.includes(c))));
  return { value, bits: len * Math.log2(pool.length) };
}

function generator(el) {
  el.innerHTML = `
    <div data-ui="segmented-control" data-default-value="password" id="g-mode" aria-label="What to generate">
      <button type="button" data-ui-part="item" data-value="password" data-mode="password">Password</button>
      <button type="button" data-ui-part="item" data-value="passphrase" data-mode="passphrase">Passphrase</button>
      <button type="button" data-ui-part="item" data-value="token" data-mode="token">Token / key</button>
    </div>
    <div class="out-row">
      <output class="mono out big" id="g-out" aria-live="polite"></output>
      ${tip(`<button type="button" class="btn" data-variant="outline" id="g-new" data-ui-part="trigger" aria-label="Generate another">${icon('refresh')}</button>`, 'Generate another')}
    </div>
    <div class="meter"><i id="g-bar"></i></div>
    <p class="hint" id="g-info"></p>
    <div data-pane="password">
      <label class="range"><span>Length <b id="g-len-v">20</b></span><input type="range" id="g-len" min="8" max="128" value="20"></label>
      <div class="checks">
        <label><input type="checkbox" data-ui="checkbox" id="g-lower" checked> a–z</label>
        <label><input type="checkbox" data-ui="checkbox" id="g-upper" checked> A–Z</label>
        <label><input type="checkbox" data-ui="checkbox" id="g-digits" checked> 0–9</label>
        <label><input type="checkbox" data-ui="checkbox" id="g-symbols" checked> Symbols</label>
        <label><input type="checkbox" data-ui="checkbox" id="g-amb"> Avoid look‑alikes (l, 1, O, 0)</label>
      </div>
    </div>
    <div data-pane="passphrase" hidden>
      <label class="range"><span>Words <b id="g-words-v">5</b></span><input type="range" id="g-words" min="3" max="10" value="5"></label>
      <div class="checks">
        <label>Separator <select id="g-sep"><option value="-">hyphen</option><option value=" ">space</option><option value=".">dot</option><option value="_">underscore</option></select></label>
        <label><input type="checkbox" data-ui="checkbox" id="g-cap"> Capitalize</label>
        <label><input type="checkbox" data-ui="checkbox" id="g-num"> Add a number</label>
      </div>
      <p class="hint">Words come from the EFF long word list (7,776 words, ≈12.9 bits each).</p>
    </div>
    <div data-pane="token" hidden>
      <div class="checks">
        <label>Format <select id="g-fmt">
          <option value="hex32">256‑bit hex</option><option value="b64u32">256‑bit base64url</option>
          <option value="hex16">128‑bit hex</option><option value="uuid">UUID v4</option><option value="pin6">6‑digit PIN</option>
        </select></label>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn" data-variant="outline" id="g-copy">Copy</button>
      <button type="button" class="btn" id="g-push">Share via secure link →</button>
    </div>`;
  let mode = 'password';
  let current = '';
  const gen = async () => {
    let bits = 0;
    if (mode === 'password') {
      const r = generatePassword(+$('#g-len', el).value, {
        lower: $('#g-lower', el).checked, upper: $('#g-upper', el).checked, digits: $('#g-digits', el).checked,
        symbols: $('#g-symbols', el).checked, noAmbiguous: $('#g-amb', el).checked,
      });
      current = r.value; bits = r.bits;
    } else if (mode === 'passphrase') {
      const words = await loadWordlist();
      const n = +$('#g-words', el).value;
      let parts = Array.from({ length: n }, () => words[randomInt(words.length)]);
      if ($('#g-cap', el).checked) parts = parts.map((w) => w[0].toUpperCase() + w.slice(1));
      bits = n * Math.log2(words.length);
      if ($('#g-num', el).checked) { parts.push(String(randomInt(100)).padStart(2, '0')); bits += Math.log2(100); }
      current = parts.join($('#g-sep', el).value);
    } else {
      const f = $('#g-fmt', el).value;
      if (f === 'hex32') { current = toHex(randomBytes(32)); bits = 256; }
      else if (f === 'hex16') { current = toHex(randomBytes(16)); bits = 128; }
      else if (f === 'b64u32') { current = toB64u(randomBytes(32)); bits = 256; }
      else if (f === 'uuid') { current = crypto.randomUUID(); bits = 122; }
      else { current = String(randomInt(1e6)).padStart(6, '0'); bits = Math.log2(1e6); }
    }
    $('#g-out', el).textContent = current || 'Pick at least one character set';
    $('#g-bar', el).style.width = `${Math.min(100, (bits / 128) * 100)}%`;
    $('#g-bar', el).dataset.level = bits < 40 ? 1 : bits < 64 ? 2 : bits < 90 ? 3 : 4;
    $('#g-info', el).textContent = current ? `≈ ${Math.round(bits)} bits of entropy · generated with your browser's cryptographic RNG` : '';
  };
  $('#g-mode', el).addEventListener('ui:change', (e) => {
    mode = e.detail.value;
    $$('[data-pane]', el).forEach((p) => { p.hidden = p.dataset.pane !== mode; });
    gen();
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'g-len') $('#g-len-v', el).textContent = e.target.value;
    if (e.target.id === 'g-words') $('#g-words-v', el).textContent = e.target.value;
    gen();
  });
  $('#g-new', el).addEventListener('click', gen);
  $('#g-copy', el).addEventListener('click', () => current && copyText(current, 'Copied'));
  $('#g-push', el).addEventListener('click', () => current && pushIt(current));
  gen();
}

// ------------------------------------------------------------- strength --
const COMMON = new Set(('123456 password 12345678 qwerty 123456789 12345 1234 111111 1234567 dragon 123123 baseball abc123 football monkey letmein ' +
  'shadow master 666666 qwertyuiop 123321 mustang 1234567890 michael 654321 superman 1qaz2wsx 7777777 121212 000000 qazwsx 123qwe killer trustno1 ' +
  'jordan jennifer zxcvbnm asdfgh hunter buster soccer harley batman andrew tigger sunshine iloveyou 2000 charlie robert thomas hockey ranger daniel ' +
  'starwars klaster 112233 george computer michelle jessica pepper 1111 zxcvbn 555555 11111111 131313 freedom 777777 pass maggie 159753 aaaaaa ginger ' +
  'princess joshua cheese amanda summer love ashley nicole chelsea biteme matthew access yankees 987654321 dallas austin thunder taylor matrix admin ' +
  'welcome welcome1 password1 passw0rd p@ssw0rd p@ssword admin123 root toor changeme secret login qwerty123 letmein1 iloveyou1 monkey1 dragon1').split(' '));
const SEQS = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const LEET = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function adjacent(a, b) {
  if (a === b) return true;
  return SEQS.some((s) => { const i = s.indexOf(a); const j = s.indexOf(b); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; });
}

export function estimateStrength(pw, words) {
  if (!pw) return { bits: 0, score: 0, notes: [] };
  const notes = [];
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  if (/[^\x00-\x7f]/.test(pw)) pool += 100;
  const perChar = Math.log2(pool);
  const lower = pw.toLowerCase();
  const deleet = lower.replace(/[013457@$!]/g, (c) => LEET[c]);

  if (COMMON.has(lower) || COMMON.has(deleet)) {
    return { bits: 4, score: 0, notes: ['This is one of the most commonly used passwords. Attackers try it first.'] };
  }
  let bits = 0;
  let foundWord = false;
  let foundSeq = false;
  for (let i = 0; i < pw.length;) {
    let matched = 0;
    if (words) {
      for (let L = Math.min(9, pw.length - i); L >= 4; L--) {
        if (words.has(deleet.substr(i, L)) || words.has(lower.substr(i, L))) { matched = L; break; }
      }
    }
    if (matched) {
      const chunk = pw.substr(i, matched);
      bits += 13 + (/[A-Z]/.test(chunk) ? 1.5 : 0) + (chunk.toLowerCase() !== deleet.substr(i, matched) ? 1.5 : 0);
      foundWord = true;
      i += matched;
    } else {
      const cont = i > 0 && adjacent(lower[i - 1], lower[i]);
      if (cont) foundSeq = true;
      bits += cont ? perChar * 0.25 : perChar;
      i++;
    }
  }
  if (/(19|20)\d\d/.test(pw)) { bits -= 4; notes.push('Contains what looks like a year — a very common pattern.'); }
  if (foundWord) notes.push('Contains dictionary words. Fine in a long random passphrase, weak on their own.');
  if (foundSeq) notes.push('Contains repeated characters or keyboard/alphabet sequences.');
  if (pw.length < 12) notes.push('Shorter than 12 characters. Length matters more than complexity.');
  if (pool <= 26 && !foundWord) notes.push('Uses a single character class. Mixing classes or adding length helps.');
  bits = Math.max(1, bits);
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { bits, score, notes };
}

function humanTime(seconds) {
  if (seconds < 1) return 'instantly';
  const units = [['year', 31557600], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  if (seconds > 31557600 * 1e9) return 'billions of years+';
  for (const [name, s] of units) {
    if (seconds >= s) {
      const v = seconds / s;
      const n = v >= 1e6 ? `${(v / 1e6).toFixed(0)} million` : v >= 1000 ? `${Math.round(v).toLocaleString()}` : `${Math.round(v)}`;
      return `${n} ${name}${Math.round(v) === 1 ? '' : 's'}`;
    }
  }
  return 'instantly';
}

async function sha1Hex(text) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-1', utf8(text)))).toUpperCase();
}
/**
 * Have I Been Pwned k-anonymity lookup: only the first 5 hex chars of the SHA-1 leave the browser.
 * The request goes through our own /api/breach relay, so ad blockers and strict browsers don't break it
 * and the breach service never sees the visitor's IP address.
 */
export async function breachCount(pw) {
  const hash = await sha1Hex(pw);
  let res;
  try { res = await fetch(`/api/breach/${hash.slice(0, 5)}`, { cache: 'no-store' }); }
  catch { throw new Error(navigator.onLine === false ? 'you are offline' : 'no connection to the server'); }
  if (!res.ok) throw new Error(res.status === 429 ? 'too many checks, try again in a few minutes' : `the breach service answered ${res.status}`);
  const suffix = hash.slice(5);
  for (const line of (await res.text()).split('\n')) {
    const [suf, count] = line.trim().split(':');
    if (suf === suffix) return Number(count);
  }
  return 0;
}

function strength(el) {
  const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  el.innerHTML = `
    <div class="field"><label for="s-pw">Password to analyse</label>
      <div data-ui="toggle-password"><input type="password" data-ui-part="input" id="s-pw" class="mono" autocomplete="off" spellcheck="false" placeholder="Type or paste a password"><button type="button" data-ui-part="toggle" aria-label="Show or hide the password">${icon('eye')}</button></div></div>
    <div class="meter"><i id="s-bar"></i></div>
    <p class="verdict"><b id="s-label">—</b> <span id="s-bits" class="hint"></span></p>
    <div class="stat-grid" id="s-times"></div>
    <ul class="notes" id="s-notes"></ul>
    <div class="actions"><button type="button" class="btn" id="s-hibp" disabled>Check against known data breaches</button></div>
    <p id="s-breach" class="callout" hidden></p>
    <p class="hint">Analysis happens on your device. The breach check uses the Have I Been Pwned <em>k‑anonymity</em> method: only the first 5 characters of a fingerprint (SHA‑1 hash) of the password are sent, relayed through our server. The password itself never leaves your device.</p>`;
  let words;
  let checking = false;   // a breach lookup is in flight
  let shownFor = null;    // the password the visible breach result belongs to
  loadWordlist().then((w) => { words = new Set(w); update(); });
  const update = () => {
    const pw = $('#s-pw', el).value;
    const r = estimateStrength(pw, words);
    $('#s-hibp', el).disabled = !pw || checking;
    // Only clear the breach result when the password actually changed, not on every re-analysis.
    if (pw !== shownFor) { $('#s-breach', el).hidden = true; shownFor = null; }
    $('#s-bar', el).style.width = pw ? `${Math.min(100, (r.bits / 100) * 100)}%` : '0';
    $('#s-bar', el).dataset.level = Math.max(1, r.score);
    $('#s-label', el).textContent = pw ? LABELS[r.score] : '—';
    $('#s-bits', el).textContent = pw ? `≈ ${Math.round(r.bits)} bits (estimate)` : '';
    const guesses = 2 ** (r.bits - 1);
    $('#s-times', el).innerHTML = pw ? [
      ['Online attack', '10 guesses/sec, rate‑limited login', 10],
      ['Stolen slow hash', 'bcrypt/Argon2, 10k guesses/sec', 1e4],
      ['Stolen fast hash', 'MD5/SHA‑1 on GPUs, 10B guesses/sec', 1e10],
    ].map(([t, d, rate]) => `<div class="stat"><small>${t}</small><b>${esc(humanTime(guesses / rate))}</b><span>${d}</span></div>`).join('') : '';
    $('#s-notes', el).innerHTML = r.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  };
  $('#s-pw', el).addEventListener('input', update);
  $('#s-pw', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value) $('#s-hibp', el).click(); });
  $('#s-hibp', el).addEventListener('click', async () => {
    const pw = $('#s-pw', el).value;
    if (!pw || checking) return;
    const out = $('#s-breach', el);
    const btn = $('#s-hibp', el);
    checking = true; shownFor = pw;
    btn.disabled = true; btn.textContent = 'Checking…';
    setCallout(out, '', 'Checking known breaches…');
    let cls; let text;
    try {
      const n = await breachCount(pw);
      cls = n ? 'bad' : 'ok';
      text = n
        ? `⚠ This password appears ${n.toLocaleString()} time${n === 1 ? '' : 's'} in known data breaches. Do not use it anywhere.`
        : '✓ Not found in any known breach. (That alone does not make it strong.)';
    } catch (e) {
      cls = 'bad';
      text = `Could not check right now: ${e.message}.`;
    }
    checking = false;
    btn.textContent = 'Check against known data breaches';
    btn.disabled = !$('#s-pw', el).value;
    if ($('#s-pw', el).value !== pw) return; // the password changed while we were checking: don't show a stale answer
    setCallout(out, cls, text);
    out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  update();
}

// ----------------------------------------------------------------- hash --
const HASHES = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
function hash(el) {
  el.innerHTML = `
    <div class="field"><label for="h-text">Text</label><textarea id="h-text" rows="4" class="mono" spellcheck="false" placeholder="Type text to hash…"></textarea></div>
    <div class="field"><label for="h-file">…or a file (never uploaded)</label><input type="file" id="h-file"></div>
    <div class="field"><label for="h-key">HMAC key <span class="muted">(optional — leave empty for a plain hash)</span></label><input type="text" id="h-key" class="mono" autocomplete="off" spellcheck="false"></div>
    <div id="h-out" class="kv"></div>
    <div class="field"><label for="h-cmp">Compare with expected checksum</label><input type="text" id="h-cmp" class="mono" autocomplete="off" spellcheck="false" placeholder="Paste a checksum to verify"></div>
    <p id="h-match" class="callout" hidden></p>`;
  let results = {};
  let seq = 0;
  const compare = () => {
    const want = $('#h-cmp', el).value.trim().toLowerCase().replace(/\s+/g, '');
    const out = $('#h-match', el);
    if (!want) { out.hidden = true; return; }
    const hit = Object.entries(results).find(([, v]) => v === want);
    setCallout(out, hit ? 'ok' : 'bad', hit ? `✓ Matches ${hit[0]}` : '✗ Does not match any of the digests above');
  };
  const run = async () => {
    const my = ++seq;
    const file = $('#h-file', el).files[0];
    const data = file ? new Uint8Array(await file.arrayBuffer()) : utf8($('#h-text', el).value);
    const key = $('#h-key', el).value;
    const out = {};
    for (const alg of HASHES) {
      let buf;
      if (key) {
        const k = await crypto.subtle.importKey('raw', utf8(key), { name: 'HMAC', hash: alg }, false, ['sign']);
        buf = await crypto.subtle.sign('HMAC', k, data);
      } else buf = await crypto.subtle.digest(alg, data);
      out[(key ? 'HMAC-' : '') + alg] = toHex(new Uint8Array(buf));
    }
    if (my !== seq) return;
    results = out;
    $('#h-out', el).innerHTML = Object.entries(out).map(([k, v]) =>
      `<div><small>${k}</small><code class="mono">${v}</code><button type="button" class="btn" data-variant="ghost" data-size="s" data-copy="${v}">Copy</button></div>`).join('');
    compare();
  };
  el.addEventListener('input', (e) => (e.target.id === 'h-cmp' ? compare() : run()));
  el.addEventListener('click', (e) => { if (e.target.dataset.copy) copyText(e.target.dataset.copy, 'Digest copied'); });
  run();
}

// ------------------------------------------------------- text encryptor --
const ENC_ITERS = 600000;
async function passKey(pass, salt) {
  const pk = await crypto.subtle.importKey('raw', utf8(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ENC_ITERS }, pk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(text, pass) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passKey(pass, salt), utf8(text)));
  return `vd1.${toB64u(salt)}.${toB64u(iv)}.${toB64u(ct)}`;
}
export async function decryptText(blob, pass) {
  const [v, salt, iv, ct] = blob.trim().split('.');
  if (v !== 'vd1' || !ct) throw new Error('Not a VaultDrop encrypted message');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv) }, await passKey(pass, fromB64u(salt)), fromB64u(ct));
  return fromUtf8(new Uint8Array(plain));
}
function cipher(el) {
  el.innerHTML = `
    <div class="field"><label for="c-in">Message or encrypted block</label><textarea id="c-in" rows="5" class="mono" spellcheck="false" placeholder="Plain text to encrypt, or a vd1.… block to decrypt"></textarea></div>
    <div class="field"><label for="c-pass">Passphrase</label><div data-ui="toggle-password"><input type="password" data-ui-part="input" id="c-pass" autocomplete="off"><button type="button" data-ui-part="toggle" aria-label="Show or hide the passphrase">${icon('eye')}</button></div></div>
    <div class="actions">
      <button type="button" class="btn" id="c-enc">Encrypt</button>
      <button type="button" class="btn" data-variant="outline" id="c-dec">Decrypt</button>
    </div>
    <div class="field"><label for="c-out">Result</label><textarea id="c-out" rows="5" class="mono" readonly></textarea></div>
    <div class="actions"><button type="button" class="btn" data-variant="outline" id="c-copy">Copy result</button></div>
    <p class="hint">AES‑256‑GCM with a key derived from your passphrase via PBKDF2‑SHA‑256 (600,000 iterations). Works offline — paste the block into an email or chat and share the passphrase another way.</p>`;
  const go = async (fn, label) => {
    const pass = $('#c-pass', el).value;
    if (!$('#c-in', el).value || !pass) return toast('Enter a message and a passphrase', 'bad');
    try { $('#c-out', el).value = await fn($('#c-in', el).value, pass); }
    catch (e) { $('#c-out', el).value = ''; toast(e.name === 'OperationError' ? 'Wrong passphrase or corrupted data' : `${label} failed: ${e.message}`, 'bad'); }
  };
  $('#c-enc', el).addEventListener('click', () => go(encryptText, 'Encrypt'));
  $('#c-dec', el).addEventListener('click', () => go(decryptText, 'Decrypt'));
  $('#c-copy', el).addEventListener('click', () => $('#c-out', el).value && copyText($('#c-out', el).value, 'Result copied'));
}

// ----------------------------------------------------------------- TOTP --
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(s) {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('Secret must be base32 (A–Z, 2–7)');
  const out = [];
  let bits = 0; let val = 0;
  for (const c of clean) {
    val = (val << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >>> bits) & 0xff); }
  }
  return new Uint8Array(out);
}
export function base32Encode(bytes) {
  let out = ''; let bits = 0; let val = 0;
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(val >>> bits) & 31]; }
  }
  if (bits) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export async function totp(secretBytes, time = Date.now(), period = 30, digits = 6) {
  const counter = new DataView(new ArrayBuffer(8));
  counter.setUint32(4, Math.floor(time / 1000 / period));
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
  const o = mac[19] & 0xf;
  const code = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}
function totpTool(el) {
  el.innerHTML = `
    <div class="field"><label for="t-secret">2FA secret (base32)</label>
      <div class="pw-wrap"><input type="text" id="t-secret" class="mono" autocomplete="off" spellcheck="false" placeholder="e.g. JBSWY3DPEHPK3PXP">
      <button type="button" class="btn" data-variant="ghost" id="t-new">New secret</button></div></div>
    <div class="field"><label for="t-label">Account label <span class="muted">(for the QR code)</span></label><input type="text" id="t-label" value="user@example.com" autocomplete="off"></div>
    <div class="totp">
      <div><output class="mono code" id="t-code">––– –––</output>
        <div class="meter thin"><i id="t-bar" data-level="4"></i></div>
        <p class="hint" id="t-left"></p>
        <div class="actions"><button type="button" class="btn" data-variant="outline" id="t-copy">Copy code</button></div></div>
      <canvas id="t-qr" class="qr" width="1" height="1" aria-label="QR code for authenticator apps"></canvas>
    </div>
    <p class="hint">Standard TOTP (RFC 6238, SHA‑1, 6 digits, 30 s) — compatible with Google Authenticator, Authy, 1Password and others. Use it to test a 2FA setup or generate a fresh secret. The secret stays in this tab.</p>`;
  let code = '';
  const tick = async () => {
    const raw = $('#t-secret', el).value;
    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    try {
      code = raw.trim() ? await totp(base32Decode(raw)) : '';
      $('#t-code', el).textContent = code ? `${code.slice(0, 3)} ${code.slice(3)}` : '––– –––';
      $('#t-left', el).textContent = code ? `Refreshes in ${left}s` : 'Enter or generate a secret';
    } catch (e) { code = ''; $('#t-code', el).textContent = '––– –––'; $('#t-left', el).textContent = e.message; }
    $('#t-bar', el).style.width = code ? `${(left / 30) * 100}%` : '0';
  };
  const qr = () => {
    const secret = $('#t-secret', el).value.toUpperCase().replace(/[\s=-]/g, '');
    const c = $('#t-qr', el);
    c.hidden = !secret || /[^A-Z2-7]/.test(secret);
    if (!c.hidden) drawQr(c, `otpauth://totp/${encodeURIComponent($('#t-label', el).value || 'account')}?secret=${secret}&issuer=VaultDrop`);
  };
  el.addEventListener('input', () => { tick(); qr(); });
  $('#t-new', el).addEventListener('click', () => { $('#t-secret', el).value = base32Encode(randomBytes(20)); tick(); qr(); });
  $('#t-copy', el).addEventListener('click', () => code && copyText(code, 'Code copied'));
  tick(); qr();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

// ------------------------------------------------------------------ JWT --
function jwt(el) {
  el.innerHTML = `
    <div class="field"><label for="j-in">JSON Web Token</label><textarea id="j-in" rows="5" class="mono" spellcheck="false" placeholder="eyJhbGciOi…"></textarea></div>
    <div id="j-warn"></div>
    <div class="cols"><div><h4>Header</h4><pre class="mono box" id="j-head"></pre></div><div><h4>Payload</h4><pre class="mono box" id="j-body"></pre></div></div>
    <div id="j-claims" class="kv"></div>
    <div class="field"><label for="j-secret">Verify HMAC signature <span class="muted">(HS256/384/512 — secret stays local)</span></label><input type="text" id="j-secret" class="mono" autocomplete="off" spellcheck="false" placeholder="Shared secret"></div>
    <p id="j-sig" class="callout" hidden></p>
    <p class="hint">Decoded locally — the token is never sent anywhere. Remember: a JWT payload is only encoded, not encrypted.</p>`;
  const run = async () => {
    const tok = $('#j-in', el).value.trim();
    const warn = []; const sig = $('#j-sig', el);
    sig.hidden = true;
    $('#j-head', el).textContent = $('#j-body', el).textContent = ''; $('#j-claims', el).innerHTML = ''; $('#j-warn', el).innerHTML = '';
    if (!tok) return;
    const parts = tok.split('.');
    let head; let body;
    try {
      if (parts.length !== 3) throw new Error('A JWT has three dot‑separated parts');
      head = JSON.parse(fromUtf8(fromB64u(parts[0]))); body = JSON.parse(fromUtf8(fromB64u(parts[1])));
    } catch (e) { $('#j-warn', el).innerHTML = `<p class="callout" data-tone="bad">Not a valid JWT: ${esc(e.message)}</p>`; return; }
    $('#j-head', el).textContent = JSON.stringify(head, null, 2);
    $('#j-body', el).textContent = JSON.stringify(body, null, 2);
    if (String(head.alg).toLowerCase() === 'none') warn.push('alg is "none" — this token is unsigned and must never be trusted.');
    if (typeof body.exp === 'number' && body.exp * 1000 < Date.now()) warn.push(`Token expired ${fmtRelative(body.exp * 1000)}.`);
    if (typeof body.nbf === 'number' && body.nbf * 1000 > Date.now()) warn.push('Token is not valid yet (nbf is in the future).');
    if (body.exp === undefined) warn.push('No exp claim — this token never expires.');
    $('#j-warn', el).innerHTML = warn.map((w) => `<p class="callout" data-tone="bad">⚠ ${esc(w)}</p>`).join('');
    $('#j-claims', el).innerHTML = [['iat', 'Issued'], ['nbf', 'Not before'], ['exp', 'Expires']]
      .filter(([k]) => typeof body[k] === 'number')
      .map(([k, l]) => `<div><small>${l} (${k})</small><code>${esc(fmtDate(body[k] * 1000))} · ${esc(fmtRelative(body[k] * 1000))}</code></div>`).join('');
    const secret = $('#j-secret', el).value;
    const alg = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[head.alg];
    if (!secret) return;
    sig.hidden = false;
    if (!alg) { setCallout(sig, '', `Signature check supports HS256/384/512 only (this token uses ${head.alg}).`); return; }
    try {
      const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: alg }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, fromB64u(parts[2]), utf8(`${parts[0]}.${parts[1]}`));
      setCallout(sig, ok ? 'ok' : 'bad', ok ? '✓ Signature is valid for this secret' : '✗ Signature does not match this secret');
    } catch { setCallout(sig, 'bad', '✗ Signature is malformed'); }
  };
  el.addEventListener('input', run);
}

// -------------------------------------------------------------- encoder --
function encoder(el) {
  el.innerHTML = `
    <div class="checks"><label>Format <select id="e-fmt">
      <option value="b64">Base64</option><option value="b64u">Base64URL</option><option value="hex">Hex</option><option value="url">URL (percent)</option>
    </select></label></div>
    <div class="field"><label for="e-in">Input</label><textarea id="e-in" rows="5" class="mono" spellcheck="false"></textarea></div>
    <div class="actions"><button type="button" class="btn" id="e-enc">Encode ↓</button><button type="button" class="btn" data-variant="outline" id="e-dec">Decode ↓</button></div>
    <div class="field"><label for="e-out">Output</label><textarea id="e-out" rows="5" class="mono" readonly></textarea></div>
    <div class="actions"><button type="button" class="btn" data-variant="outline" id="e-copy">Copy output</button></div>`;
  const strict = new TextDecoder('utf-8', { fatal: true });
  const enc = { b64: (s) => toB64(utf8(s)), b64u: (s) => toB64u(utf8(s)), hex: (s) => toHex(utf8(s)), url: encodeURIComponent };
  const dec = {
    b64: (s) => strict.decode(fromB64(s.replace(/\s+/g, ''))),
    b64u: (s) => strict.decode(fromB64u(s.replace(/\s+/g, ''))),
    hex: (s) => {
      const c = s.replace(/[\s:]|0x/g, '');
      if (c.length % 2 || /[^0-9a-f]/i.test(c)) throw new Error('bad hex');
      return strict.decode(Uint8Array.from(c.match(/../g) || [], (h) => parseInt(h, 16)));
    },
    url: decodeURIComponent,
  };
  const go = (table) => {
    try { $('#e-out', el).value = table[$('#e-fmt', el).value]($('#e-in', el).value); }
    catch { $('#e-out', el).value = ''; toast('Input is not valid for this format (or is not UTF‑8 text)', 'bad'); }
  };
  $('#e-enc', el).addEventListener('click', () => go(enc));
  $('#e-dec', el).addEventListener('click', () => go(dec));
  $('#e-copy', el).addEventListener('click', () => $('#e-out', el).value && copyText($('#e-out', el).value, 'Output copied'));
}

// ---------------------------------------------------------------- mount --
export const TOOLS = [
  { id: 'generator', icon: 'dice', title: 'Password generator', desc: 'Strong passwords, passphrases, API keys and tokens.', render: generator },
  { id: 'strength', icon: 'chart', title: 'Strength & breach check', desc: 'Estimate crack time and check known data breaches privately.', render: strength },
  { id: 'encrypt', icon: 'lock', title: 'Text encryptor', desc: 'Encrypt or decrypt a message with a passphrase, fully offline.', render: cipher },
  { id: 'totp', icon: 'clock', title: '2FA code generator', desc: 'Generate TOTP secrets, QR codes and live codes.', render: totpTool },
  { id: 'hash', icon: 'hash', title: 'Hash & checksum', desc: 'SHA digests and HMAC for text or files; verify downloads.', render: hash },
  { id: 'jwt', icon: 'id', title: 'JWT inspector', desc: 'Decode tokens, spot problems, verify HMAC signatures.', render: jwt },
  { id: 'encode', icon: 'swap', title: 'Encoder / decoder', desc: 'Base64, Base64URL, hex and URL encoding.', render: encoder },
];

/** Mount the toolkit into `root`. Returns a cleanup function. */
export function mountTools(root, activeId, onSelect) {
  const tool = TOOLS.find((t) => t.id === activeId) || TOOLS[0];
  root.innerHTML = `
    <section class="page-head"><h1>Security toolkit</h1>
      <p>Seven tools that run entirely on your device — they even work offline. Nothing you type here is sent to our server.</p></section>
    <div class="tools">
      <nav class="tool-nav" aria-label="Tools">${TOOLS.map((t) => `
        <a href="/tools/${t.id}" data-tool="${t.id}" class="${t === tool ? 'on' : ''}"${t === tool ? ' aria-current="page"' : ''}>
          <span class="ico">${icon(t.icon)}</span><span><b>${t.title}</b><small>${t.desc}</small></span></a>`).join('')}
      </nav>
      <section class="card tool-panel"><h2>${tool.title}</h2><div id="tool-body"></div></section>
    </div>`;
  $$('.tool-nav a', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); onSelect(a.dataset.tool); }));
  return tool.render($('#tool-body', root)) || (() => {});
}
