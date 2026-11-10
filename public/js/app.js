import { $, $$, esc, toast, copyText, drawQr, fmtDate, fmtRelative, fmtBytes, icon } from './ui.js';
import { seal, unlock, open, utf8, fromUtf8 } from './crypto.js';
import { mountTools, generatePassword } from './tools.js';

const app = $('#app');
let cleanup = () => {};
let prefill = '';
let agentPreset = false;
let config = { maxDays: 90, maxViews: 100, maxTextBytes: 65536, maxFileBytes: 5242880 };
const configReady = fetch('/api/config').then((r) => r.json()).then((c) => { config = c; }).catch(() => {});

// ------------------------------------------------------------- plumbing --
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method || 'GET',
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('No connection to the server. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

// Owner tokens for secrets created in this browser. Never contains decryption keys.
const store = {
  all() { try { return JSON.parse(localStorage.getItem('vd-pushes') || '[]'); } catch { return []; } },
  save(list) { try { localStorage.setItem('vd-pushes', JSON.stringify(list.slice(0, 100))); } catch { /* private mode */ } },
  add(item) { this.save([item, ...this.all()]); },
  remove(id) { this.save(this.all().filter((p) => p.id !== id)); },
};

function navigate(path) {
  history.pushState(null, '', path);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  if (a.dataset.agent !== undefined) agentPreset = true;
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', render);
document.addEventListener('vd:push', (e) => { prefill = e.detail; navigate('/'); });

// ---- app shell: tabs, theme, install, offline ----
$('#tabs').innerHTML = [
  ['/', 'push', 'send', 'Share'], ['/agents', 'agents', 'bot', 'AI agents'], ['/tools', 'tools', 'tools', 'Toolkit'],
  ['/pushes', 'pushes', 'folder', 'My secrets'], ['/security', 'security', 'shield', 'Security'],
].map(([href, nav, ic, label]) => `<a href="${href}" data-link data-nav="${nav}">${icon(ic)}<span>${label}</span></a>`).join('');
const themeBtn = $('#theme-toggle');
themeBtn.innerHTML = icon('moon');
themeBtn.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('vd-theme', root.dataset.theme); } catch { /* ignore */ }
});
let installEvent;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; $('#install').hidden = true; } });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; });
const syncOnline = () => { $('#offline').hidden = navigator.onLine; };
window.addEventListener('online', syncOnline); window.addEventListener('offline', syncOnline); syncOnline();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

function render() {
  cleanup(); cleanup = () => {};
  const path = location.pathname.replace(/\/+$/, '') || '/';
  let m; let nav = '';
  if (path === '/') { nav = 'push'; pagePush(); }
  else if ((m = path.match(/^\/p\/([\w-]{16})\/admin$/))) { nav = 'pushes'; pageAdmin(m[1]); }
  else if ((m = path.match(/^\/p\/([\w-]{16})$/))) pageView(m[1]);
  else if ((m = path.match(/^\/tools(?:\/([a-z-]+))?$/))) { nav = 'tools'; cleanup = mountTools(app, m[1], (id) => navigate(`/tools/${id}`)); }
  else if (path === '/pushes') { nav = 'pushes'; pageMine(); }
  else if (path === '/security') { nav = 'security'; pageSecurity(); }
  else if (path === '/agents') { nav = 'agents'; pageAgents(); }
  else app.innerHTML = notice('link', 'Page not found', 'That address does not exist.', '<a class="btn primary" href="/" data-link>Share a secret</a>');
  $$('#tabs [data-nav]').forEach((a) => {
    a.classList.toggle('on', a.dataset.nav === nav);
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
const notice = (ic, title, text, extra = '', muted = true) =>
  `<section class="card notice"><div class="badge ${muted ? 'muted' : ''}">${icon(ic)}</div><h1>${title}</h1><p>${text}</p>${extra ? `<div class="actions">${extra}</div>` : ''}</section>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const SUBMIT_LABEL = `${icon('lock')} Encrypt &amp; create secure link`;

// ----------------------------------------------------------------- push --
async function pagePush() {
  await configReady;
  const forAgent = agentPreset; agentPreset = false;
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">End‑to‑end encrypted · zero‑knowledge</p>
      <h1>Share a password.<br><span class="grad">Leave no trace.</span></h1>
      <p class="lede">Turn any secret into a link that works once and then destroys itself. The recommended way to hand credentials to a colleague — or to an AI agent that won't take them in chat.</p>
    </section>
    <form class="card glow narrow" id="push-form" autocomplete="off">
      <div class="seg full" role="tablist" id="kind-seg">
        <button type="button" class="on" data-kind="text">${icon('key')} Password or text</button>
        <button type="button" data-kind="file">${icon('file')} File</button>
      </div>
      <div data-pane="text">
        <label class="field"><span>Secret</span>
          <textarea id="secret" rows="4" class="mono" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="Paste a password, API key, recovery code, note…"></textarea></label>
        <div class="under"><button type="button" class="link-btn" id="gen">${icon('dice')} Generate a strong password</button><span class="hint" id="count"></span></div>
      </div>
      <div data-pane="file" hidden>
        <label class="drop" id="drop"><input type="file" id="file">
          <span id="drop-label"><b>Choose a file</b> or drop it here<br><small>Up to ${fmtBytes(config.maxFileBytes)} · encrypted before upload, including its name</small></span></label>
      </div>
      <p class="row-label">Who is it for?</p>
      <div class="seg full" id="who-seg">
        <button type="button" data-who="person">${icon('send')} A person</button>
        <button type="button" data-who="agent">${icon('bot')} An AI agent</button>
      </div>
      <p class="hint" id="who-hint"></p>
      <div class="sliders">
        <label class="range"><span>Expire after <b id="days-v"></b></span><input type="range" id="days" min="1" max="${config.maxDays}" value="7"></label>
        <label class="range"><span>…or after <b id="views-v"></b></span><input type="range" id="views" min="1" max="${config.maxViews}" value="5"></label>
      </div>
      <p class="hint">Whichever comes first. Then the encrypted data is erased for good.</p>
      <label class="field"><span>Extra passphrase <em>(optional — share it through a different channel)</em></span>
        <input type="password" id="pass" autocomplete="new-password" placeholder="Required to open the link"></label>
      <label class="field"><span>Private label <em>(optional — stays on this device only)</em></span>
        <input type="text" id="label" maxlength="60" placeholder="e.g. Deploy key for the staging agent"></label>
      <label class="check"><input type="checkbox" id="deletable" checked> Let the recipient destroy the secret after reading it</label>
      <button class="btn primary wide" id="submit">${SUBMIT_LABEL}</button>
      <p class="error" id="err" role="alert" hidden></p>
    </form>

    <div class="features narrow">
      <div class="feature">${icon('lock')}<b>We can't read it</b>Encrypted in your browser with AES‑256‑GCM. The key never reaches our server.</div>
      <div class="feature">${icon('timer')}<b>It self‑destructs</b>After the views or days you choose, the encrypted data is permanently erased.</div>
      <div class="feature">${icon('list')}<b>You stay in control</b>See when the link was opened, and destroy it early at any time.</div>
    </div>
    <section class="card narrow banner">
      <div class="badge">${icon('bot')}</div>
      <div><h2>Your AI agent refused to take a password?</h2>
        <p>Good — chat transcripts are stored and replayed. Give it a one‑time VaultDrop link instead.</p></div>
      <a class="btn" href="/agents" data-link>See how it works</a>
    </section>
    <p class="hint center narrow"><a href="/security" data-link>Read exactly how the encryption works →</a></p>`;
  const form = $('#push-form');
  let kind = 'text';
  let who = 'person';
  const secret = $('#secret');
  if (prefill) { secret.value = prefill; prefill = ''; }
  const sync = () => {
    $('#days-v').textContent = plural(+$('#days').value, 'day');
    $('#views-v').textContent = plural(+$('#views').value, 'view');
    $('#count').textContent = secret.value ? `${secret.value.length} characters` : '';
  };
  const setWho = (w) => {
    who = w;
    $$('#who-seg button').forEach((x) => x.classList.toggle('on', x.dataset.who === w));
    $('#days').value = w === 'agent' ? 1 : Math.min(7, config.maxDays);
    $('#views').value = w === 'agent' ? 1 : Math.min(5, config.maxViews);
    $('#who-hint').textContent = w === 'agent'
      ? 'One view, 24 hours: the link dies the moment the agent reads it, so the copy left in your chat history is worthless.'
      : 'A few views over a week is a sensible default. Tighten it for anything sensitive.';
    sync();
  };
  form.addEventListener('input', sync);
  setWho(forAgent ? 'agent' : 'person');
  $$('#who-seg button').forEach((b) => b.addEventListener('click', () => setWho(b.dataset.who)));
  $$('#kind-seg button').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    $$('#kind-seg button').forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-pane]', form).forEach((p) => { p.hidden = p.dataset.pane !== kind; });
  }));
  $('#gen').addEventListener('click', () => {
    secret.value = generatePassword(20, { lower: true, upper: true, digits: true, symbols: true }).value;
    sync();
  });
  const fileInput = $('#file');
  const showFile = () => {
    const f = fileInput.files[0];
    if (f) $('#drop-label').innerHTML = `<b>${esc(f.name)}</b><br><small>${fmtBytes(f.size)} · tap to choose another</small>`;
  };
  fileInput.addEventListener('change', showFile);
  const drop = $('#drop');
  ['dragover', 'dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.toggle('over', ev === 'dragover');
    if (ev === 'drop' && e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; showFile(); }
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err'); err.hidden = true;
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    let header; let data;
    if (kind === 'text') {
      if (!secret.value) return fail('Enter a secret to share.');
      data = utf8(secret.value);
      if (data.length > config.maxTextBytes) return fail(`Text secrets are limited to ${fmtBytes(config.maxTextBytes)}. Use the File tab for larger content.`);
      header = { t: 'text' };
    } else {
      const f = fileInput.files[0];
      if (!f) return fail('Choose a file to share.');
      if (f.size > config.maxFileBytes - 4096) return fail(`That file is too large. The limit is ${fmtBytes(config.maxFileBytes)}.`);
      data = new Uint8Array(await f.arrayBuffer());
      header = { t: 'file', name: f.name, mime: f.type || 'application/octet-stream' };
    }
    const btn = $('#submit'); btn.disabled = true; btn.textContent = 'Encrypting on your device…';
    try {
      const pass = $('#pass').value;
      const sealed = await seal(header, data, pass);
      const days = +$('#days').value; const views = +$('#views').value;
      const res = await api('/pushes', { method: 'POST', body: {
        kind, ct: sealed.ct, salt: sealed.salt, auth: sealed.auth, kdfIters: sealed.kdfIters,
        days, views, passphrase: !!pass, deletable: $('#deletable').checked,
      } });
      store.add({ id: res.id, token: res.adminToken, createdAt: Date.now(), kind, label: $('#label').value.trim() });
      showCreated({ id: res.id, token: res.adminToken, linkKey: sealed.linkKey, days, views, pass: !!pass, expiresAt: res.expiresAt, kind, agent: who === 'agent' });
    } catch (ex) {
      btn.disabled = false; btn.innerHTML = SUBMIT_LABEL;
      fail(ex.message || 'Something went wrong. Your secret was not stored.');
    }
  });
}

/** Ready-to-paste message that tells an AI agent how to fetch the secret without echoing it into the chat. */
function agentMessage(link, { pass, kind }) {
  const out = kind === 'file' ? '--out ./secret-file' : '--out .secret';
  return [
    'I\'m not pasting the credential into this chat. Here is a one-time, end-to-end encrypted VaultDrop link instead. It self-destructs after it is opened:',
    '', link, '',
    'Fetch it straight to a file so the value never appears in this conversation:',
    '',
    `curl -fsSO ${location.origin}/vd-get.mjs`,
    `node vd-get.mjs '${link}' ${out}`,
    '',
    pass ? 'It is passphrase-protected: read the passphrase from the VD_PASSPHRASE environment variable (I will set it separately).' : null,
    'Do not print, log or repeat the secret. Read it from the file when you need it and delete the file when you are done.',
  ].filter((l) => l !== null).join('\n');
}

function showCreated(c) {
  const { id, token, linkKey, days, views, pass, expiresAt } = c;
  const link = `${location.origin}/p/${id}#${linkKey}`;
  const msg = agentMessage(link, c);
  app.innerHTML = `
    <section class="card glow created">
      <p class="eyebrow">Encrypted and stored</p>
      <h1>Your secure link is ready</h1>
      <p>It works for <b>${plural(views, 'view')}</b> or until <b>${esc(fmtDate(expiresAt))}</b> (${plural(days, 'day')}), whichever comes first.</p>
      <div class="linkbox"><input type="text" class="mono" id="link" readonly aria-label="Secret link">
        <button class="btn primary" id="copy" type="button">Copy link</button>
        <button class="btn" id="share" type="button" hidden>${icon('share')} Share</button></div>
      <div class="created-grid">
        <canvas class="qr" id="qr" width="1" height="1" aria-label="QR code of the secret link"></canvas>
        <ul class="notes plain">
          <li><b>This link is shown only once.</b> The part after <code>#</code> is the decryption key; we never receive it, so we cannot show it to you again.</li>
          ${pass ? '<li><b>Passphrase required.</b> Send the passphrase separately — by phone or a different app.</li>' : '<li>Anyone with the full link can open it. For extra safety, add a passphrase next time and send it separately.</li>'}
          <li>Opening the link shows a confirmation step first, so link previews and scanners don\'t use up views.</li>
        </ul>
      </div>
      <details class="handoff"${c.agent ? ' open' : ''}>
        <summary>${icon('bot')} Giving this to an AI agent?</summary>
        <div>
          <p class="hint">Paste this message into the chat instead of the password. The agent downloads and decrypts the secret inside its own workspace; once it has, the link left in the transcript is dead.</p>
          <pre class="snippet" id="agent-msg"></pre>
          <div class="actions"><button class="btn primary" id="copy-agent" type="button">Copy message for the agent</button>
            <a class="btn ghost" href="/agents" data-link>Why this is safer</a></div>
        </div>
      </details>
      <div class="actions">
        <a class="btn" href="/p/${id}/admin#${token}" data-link>${icon('list')} Audit log &amp; manage</a>
        <a class="btn ghost" href="/" data-link>Share another secret</a>
      </div>
    </section>`;
  $('#link').value = link;
  $('#agent-msg').textContent = msg;
  $('#link').addEventListener('focus', (e) => e.target.select());
  $('#copy').addEventListener('click', () => copyText(link, 'Link copied'));
  $('#copy-agent').addEventListener('click', () => copyText(msg, 'Message copied'));
  if (navigator.share) {
    $('#share').hidden = false;
    $('#share').addEventListener('click', () => navigator.share({ title: 'A secret for you', text: 'Open this one-time secure link:', url: link }).catch(() => {}));
  }
  drawQr($('#qr'), link);
  window.scrollTo(0, 0);
}

// ----------------------------------------------------------------- view --
const GONE = {
  views: 'It reached its view limit.', time: 'Its time limit passed.',
  deleted_by_owner: 'The sender destroyed it.', deleted_by_viewer: 'A recipient destroyed it after reading.',
};
async function pageView(id) {
  const linkKey = location.hash.slice(1);
  app.innerHTML = '<section class="card notice"><p>Loading…</p></section>';
  let meta;
  try { meta = await api(`/pushes/${id}`); }
  catch (e) {
    app.innerHTML = notice('x', 'Nothing here', esc(e.status === 404 ? 'This secret does not exist, or it expired and was permanently erased.' : e.message),
      '<a class="btn primary" href="/" data-link>Share a secret of your own</a>');
    return;
  }
  if (meta.status === 'expired') {
    app.innerHTML = notice('timer', 'This secret is gone', `${GONE[meta.endedWhy] || 'It expired.'} The encrypted data was permanently erased from our server and cannot be recovered by anyone — including us.`,
      '<a class="btn primary" href="/" data-link>Share a secret of your own</a>');
    return;
  }
  if (!/^[\w-]{43}$/.test(linkKey)) {
    app.innerHTML = notice('link', 'This link is incomplete', 'The decryption key (the part after <code>#</code>) is missing or damaged. Ask the sender to copy the whole link again. No view was used.');
    return;
  }
  const what = meta.kind === 'file' ? 'file' : 'secret';
  app.innerHTML = `
    <section class="card glow reveal">
      <div class="badge">${icon('lock')}</div>
      <h1>Someone shared a ${what} with you</h1>
      <p>It can be opened <b>${meta.viewsLeft} more time${meta.viewsLeft === 1 ? '' : 's'}</b> and expires <b>${esc(fmtRelative(meta.expiresAt))}</b>. Opening it now uses one view.</p>
      <form id="open-form" autocomplete="off">
        ${meta.passphrase ? '<label class="field"><span>Passphrase from the sender</span><input type="password" id="pass" autocomplete="off" required autofocus></label>' : ''}
        <button class="btn primary wide" id="open-btn">${icon('eye')} Reveal ${what}</button>
        <p class="error" id="err" role="alert" hidden></p>
      </form>
      <p class="hint">Decryption happens on your device. Make sure nobody is looking over your shoulder.</p>
    </section>`;
  $('#open-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err'); err.hidden = true;
    const btn = $('#open-btn'); btn.disabled = true; btn.textContent = 'Decrypting…';
    try {
      const keys = await unlock(linkKey, meta.passphrase ? $('#pass').value : '', meta.salt, meta.kdfIters);
      const res = await api(`/pushes/${id}/view`, { method: 'POST', body: { auth: keys.auth } });
      const { header, data } = await open(keys.encKey, res.ct);
      showSecret(id, keys.auth, header, data, res);
    } catch (ex) {
      btn.disabled = false; btn.innerHTML = `${icon('eye')} Reveal ${what}`;
      err.textContent = ex.name === 'OperationError' ? 'Could not decrypt: the link key is wrong or the data was altered.' : ex.message;
      err.hidden = false;
    }
  });
}

function showSecret(id, auth, header, data, res) {
  const isFile = header.t === 'file';
  const left = res.viewsLeft;
  app.innerHTML = `
    <section class="card glow reveal">
      <p class="eyebrow">Decrypted on your device</p>
      <h1>${isFile ? 'Your file is ready' : 'Here is the secret'}</h1>
      ${isFile
    ? `<div class="filebox">${icon('file')}<div><b id="fname"></b><small>${fmtBytes(data.length)}</small></div><a class="btn primary" id="dl">${icon('download')} Download</a></div>`
    : `<div class="secret-wrap"><pre class="mono secret blurred" id="secret" tabindex="0"></pre></div>
       <div class="actions"><button class="btn primary" id="copy" type="button">Copy to clipboard</button><button class="btn" id="toggle" type="button">Show</button></div>`}
      <p class="callout ${left ? '' : 'good'}" id="status">${left
    ? `This link can be opened ${left} more time${left === 1 ? '' : 's'}.`
    : 'That was the last view. The encrypted data has been permanently erased from our server.'}</p>
      ${left && res.deletable ? `<div class="actions"><button class="btn danger" id="burn" type="button">${icon('trash')} Destroy this secret now</button></div><p class="hint">Got what you need? Destroying it means the link can never be opened again.</p>` : ''}
    </section>`;
  if (isFile) {
    $('#fname').textContent = header.name;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    const a = $('#dl'); a.href = url; a.download = header.name || 'secret';
    cleanup = () => URL.revokeObjectURL(url);
  } else {
    const text = fromUtf8(data);
    const pre = $('#secret'); pre.textContent = text;
    $('#copy').addEventListener('click', () => copyText(text, 'Secret copied'));
    $('#toggle').addEventListener('click', (e) => {
      e.target.textContent = pre.classList.toggle('blurred') ? 'Show' : 'Hide';
    });
  }
  const burn = $('#burn');
  if (burn) burn.addEventListener('click', async () => {
    burn.disabled = true;
    try {
      await api(`/pushes/${id}`, { method: 'DELETE', body: { auth } });
      burn.closest('.actions').nextElementSibling.remove(); burn.closest('.actions').remove();
      const s = $('#status'); s.className = 'callout good'; s.textContent = 'Destroyed. The encrypted data has been permanently erased from our server.';
    } catch (ex) { burn.disabled = false; toast(ex.message, 'bad'); }
  });
}

// ---------------------------------------------------------------- admin --
const EVENTS = {
  created: ['check', 'Secret created'], viewed: ['eye', 'Secret revealed'], failed_attempt: ['alert', 'Failed attempt (wrong passphrase or key)'],
  deleted_by_owner: ['trash', 'Destroyed by you'], deleted_by_viewer: ['trash', 'Destroyed by recipient'],
};
function statusPill(m) {
  return m.status === 'active'
    ? `<span class="pill good">Active · ${m.viewsLeft}/${m.viewsMax} views left</span>`
    : `<span class="pill">Erased · ${esc((GONE[m.endedWhy] || 'Expired.').replace(/\.$/, ''))}</span>`;
}
async function pageAdmin(id) {
  const token = location.hash.slice(1) || (store.all().find((p) => p.id === id) || {}).token;
  app.innerHTML = '<section class="card notice"><p>Loading…</p></section>';
  let m;
  try {
    if (!token) throw new Error('This page needs the owner link that was shown when the secret was created.');
    m = await api(`/pushes/${id}/audit`, { headers: { 'X-Admin-Token': token } });
  } catch (e) {
    app.innerHTML = notice('alert', 'Audit log unavailable', esc(e.status === 404 ? 'This secret no longer exists. Records are removed some time after a secret is erased.' : e.message),
      '<a class="btn" href="/pushes" data-link>My secrets</a>');
    return;
  }
  const local = store.all().find((p) => p.id === id);
  app.innerHTML = `
    <section class="page-head"><h1>${local && local.label ? esc(local.label) : 'Secret'} <small>${id}</small></h1>
      <p>${statusPill(m)}</p></section>
    <section class="card">
      <div class="stat-grid">
        <div class="stat"><small>Created</small><b>${esc(fmtDate(m.createdAt))}</b></div>
        <div class="stat"><small>${m.status === 'active' ? 'Expires' : 'Erased'}</small><b>${esc(fmtDate(m.status === 'active' ? m.expiresAt : m.endedAt))}</b></div>
        <div class="stat"><small>Protection</small><b>${m.passphrase ? 'Link key + passphrase' : 'Link key'}</b></div>
      </div>
      ${m.status === 'active' ? `<div class="actions"><button class="btn danger" id="burn" type="button">${icon('trash')} Destroy this secret now</button></div>` : ''}
      <h2>Audit log</h2>
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>When</th><th>IP address</th><th>Browser / client</th></tr></thead><tbody>
        ${m.events.map((ev) => { const [ic, label] = EVENTS[ev.event] || ['list', ev.event]; return `<tr><td>${icon(ic)} ${esc(label)}</td><td>${esc(fmtDate(ev.ts))}</td><td class="mono">${esc(ev.ip || '—')}</td><td class="ua">${esc(ev.ua || '—')}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="hint">We can show who opened the link and when — but never the secret itself, because we don't have the key.</p>
    </section>`;
  const burn = $('#burn');
  if (burn) burn.addEventListener('click', async () => {
    if (!confirm('Destroy this secret? The link will stop working immediately. This cannot be undone.')) return;
    try { await api(`/pushes/${id}`, { method: 'DELETE', headers: { 'X-Admin-Token': token } }); toast('Secret destroyed'); pageAdmin(id); }
    catch (ex) { toast(ex.message, 'bad'); }
  });
}

async function pageMine() {
  const list = store.all();
  if (!list.length) {
    app.innerHTML = notice('folder', 'No secrets yet', 'Secrets you create on this device appear here so you can check whether they were opened, or destroy them early.',
      '<a class="btn primary" href="/" data-link>Share your first secret</a>');
    return;
  }
  app.innerHTML = `
    <section class="page-head"><h1>My secrets</h1>
      <p>Created on this device. Only owner tokens are kept here — never the secret or its decryption key.</p></section>
    <section class="card"><ul class="mine">${list.map((p) => `
      <li data-id="${esc(p.id)}"><span class="ico">${icon(p.kind === 'file' ? 'file' : 'key')}</span>
        <div><b>${esc(p.label || (p.kind === 'file' ? 'File' : 'Secret'))}</b><small>Created ${esc(fmtRelative(p.createdAt))} · <span class="mono">${esc(p.id)}</span></small></div>
        <span class="st hint">Checking…</span>
        <a class="btn sm" href="/p/${esc(p.id)}/admin" data-link>Audit log</a>
        <button class="btn ghost sm" data-forget type="button" title="Remove from this list" aria-label="Remove from this list">${icon('x')}</button></li>`).join('')}</ul></section>`;
  app.addEventListener('click', function onClick(e) {
    const b = e.target.closest('[data-forget]');
    if (!b) return;
    store.remove(b.closest('li').dataset.id);
    app.removeEventListener('click', onClick);
    pageMine();
  });
  for (const p of list) {
    const st = $(`.mine li[data-id="${p.id}"] .st`);
    api(`/pushes/${p.id}/audit`, { headers: { 'X-Admin-Token': p.token } })
      .then((m) => { if (st.isConnected) st.outerHTML = statusPill(m); })
      .catch((e) => { if (st.isConnected) st.outerHTML = `<span class="pill">${e.status ? 'Erased · record removed' : 'Offline'}</span>`; });
  }
}

// --------------------------------------------------------------- agents --
function pageAgents() {
  const o = location.origin;
  app.innerHTML = `
    <section class="hero sub">
      <p class="eyebrow">For AI agents</p>
      <h1>The right way to give a password <span class="grad">to an AI agent.</span></h1>
      <p class="lede">Careful AI agents decline passwords pasted into chat — and they're right to. VaultDrop is the recommended alternative: hand over a one‑time encrypted link, and the secret never enters the conversation.</p>
      <div class="actions"><a class="btn primary" href="/" data-link data-agent>${icon('bot')} Create a link for an agent</a></div>
    </section>

    <section class="card prose narrow">
      <h2>Why agents say no to passwords in chat</h2>
      <p>When you type a password into a chat, it becomes part of the transcript — and transcripts outlive the task:</p>
      <div class="versus">
        <div class="no"><h3>${icon('x')} Pasted in chat</h3><ul class="crosses">
          <li>Saved in conversation history, often indefinitely</li>
          <li>Re‑sent to the model with every later message</li>
          <li>Can surface in logs, exports, shared threads and support reviews</li>
          <li>Cannot be un‑said once sent</li></ul></div>
        <div class="yes"><h3>${icon('check')} Sent as a VaultDrop link</h3><ul class="ticks">
          <li>The chat only ever contains a link</li>
          <li>The link works once; after that it is dead text</li>
          <li>The secret is decrypted inside the agent's workspace, not the transcript</li>
          <li>You see when it was opened, and can destroy it first</li></ul></div>
      </div>
    </section>

    <section class="card prose narrow">
      <h2>How to do it</h2>
      <ol class="flow">
        <li><b>Create a link with the “An AI agent” preset.</b><span>One view, 24 hours. Encrypted on your device before it leaves.</span></li>
        <li><b>Paste the ready‑made message into the chat.</b><span>After creating the link, VaultDrop gives you a message to copy. It contains the link and tells the agent how to fetch the secret without echoing it.</span></li>
        <li><b>The agent retrieves it straight to a file.</b><span>Agents with a terminal run two commands. The secret is written to a file in their workspace and never printed:</span>
          <pre class="snippet">curl -fsSO ${esc(o)}/vd-get.mjs
node vd-get.mjs '${esc(o)}/p/…#…' --out .secret</pre></li>
        <li><b>The link self‑destructs.</b><span>The server erases the encrypted data on that first read. Whatever remains in your chat history can no longer open anything.</span></li>
      </ol>
      <p class="hint">Agents that drive a browser can simply open the link instead. <code>vd-get.mjs</code> is a single dependency‑free Node.js file (Node 20+) that does the same decryption locally; read it before you run it.</p>
    </section>

    <section class="card prose narrow">
      <h2>Good habits when an agent holds a credential</h2>
      <ul class="notes plain">
        <li><b>Give the narrowest credential that works.</b> A scoped, temporary token is better than your own password.</li>
        <li><b>Have the agent read it from the file or an environment variable</b> rather than repeating it in commands or messages.</li>
        <li><b>Check the audit log.</b> Exactly one “revealed” event, at the time you expect, from the agent's environment.</li>
        <li><b>Rotate or revoke when the task is done.</b> Once retrieved, the secret lives in the agent's workspace; VaultDrop protects the hand‑off, not what happens afterwards.</li>
      </ul>
      <div class="actions"><a class="btn primary" href="/" data-link data-agent>${icon('bot')} Create a link for an agent</a><a class="btn" href="/security" data-link>How the encryption works</a></div>
    </section>`;
}

// ------------------------------------------------------------- security --
function pageSecurity() {
  app.innerHTML = `
    <section class="hero sub">
      <p class="eyebrow">Security &amp; privacy</p>
      <h1>We don't keep your passwords. <span class="grad">We can't even read them.</span></h1>
      <p class="lede">Your secret is locked on your device before it leaves, and only the person — or agent — holding the link can unlock it. We store scrambled data and nothing else.</p>
    </section>

    <section class="card prose">
      <h2>What happens when you share a secret</h2>
      <ol class="flow">
        <li><b>Your browser creates a random 256‑bit key.</b><span>It is generated on your device with the browser's cryptographic random number generator.</span></li>
        <li><b>Your secret is encrypted on your device.</b><span>We use AES‑256‑GCM, the same authenticated encryption used by banks and governments. Files are encrypted together with their names.</span></li>
        <li><b>Only the encrypted result is sent to us.</b><span>Our server receives scrambled data. Without the key, it is indistinguishable from random noise.</span></li>
        <li><b>The key goes into the link, after the <code>#</code>.</b><span>Browsers never send that part of an address to a server. It travels only from you to your recipient.</span></li>
        <li><b>The recipient decrypts it locally.</b><span>Their browser (or the agent's command‑line tool) fetches the encrypted data and unlocks it with the key from the link.</span></li>
        <li><b>Then it is erased.</b><span>When the view limit or time limit is reached — or someone presses Destroy — the encrypted data is deleted and overwritten in our database.</span></li>
      </ol>
      <figure class="diagram" aria-label="Diagram: the key stays between sender and recipient; the server only holds ciphertext">
        <div class="node">You<small>secret + key</small></div>
        <div class="arrow"><span>encrypted data only</span></div>
        <div class="node srv">VaultDrop server<small>ciphertext · no key</small></div>
        <div class="arrow"><span>encrypted data only</span></div>
        <div class="node">Recipient<small>key from link</small></div>
        <div class="keyline"><span>key travels inside the link you send — never through us</span></div>
      </figure>
    </section>

    <div class="cards3">
      <section class="card prose"><h3>What we store</h3><ul class="ticks">
        <li>The encrypted secret, until it expires</li><li>Expiry settings (views and days)</li>
        <li>An access log: time, IP address and browser of each view, visible only to the sender</li>
        <li>One‑way hashes used to check that a request comes from someone holding the link</li></ul></section>
      <section class="card prose"><h3>What we never have</h3><ul class="crosses">
        <li>Your password or file in readable form</li><li>The decryption key</li><li>Your passphrase</li>
        <li>File names or the length of short secrets</li><li>Accounts, emails, cookies or trackers</li></ul></section>
      <section class="card prose"><h3>After a secret expires</h3><ul class="ticks">
        <li>The encrypted data is erased immediately and its storage overwritten</li>
        <li>The link shows only “this secret is gone”</li>
        <li>The access log is kept for a short period for the sender, then deleted too</li>
        <li>Nobody — including us — can bring it back</li></ul></section>
    </div>

    <section class="card prose">
      <h2>Layers of protection</h2>
      <dl class="layers">
        <div><dt>End‑to‑end encryption</dt><dd>AES‑256‑GCM on your device via the standard Web Crypto API. Encryption is authenticated, so any tampering with stored data is detected and decryption fails.</dd></div>
        <div><dt>Optional passphrase</dt><dd>Stretched with PBKDF2‑SHA‑256 (310,000 rounds) and mixed with the link key. Even someone who intercepts the link cannot open it without the passphrase, and wrong guesses don't use up views.</dd></div>
        <div><dt>Proof before release</dt><dd>The server hands over encrypted data only to a client that proves it holds the link key (and passphrase). The proof is a separate derived value that reveals nothing about the key itself.</dd></div>
        <div><dt>Second encryption at rest</dt><dd>What we store is encrypted again on the server with a per‑secret key. A stolen copy of the database, on its own, contains nothing usable.</dd></div>
        <div><dt>Scanner‑proof links</dt><dd>Opening a link shows a confirmation step first. Chat apps and mail filters that preview links cannot burn your views.</dd></div>
        <div><dt>Hardened delivery</dt><dd>A strict Content‑Security‑Policy blocks third‑party scripts, no referrers are sent, secret data is never cached, and requests are rate‑limited against guessing.</dd></div>
      </dl>
    </section>

    <section class="card prose">
      <h2>Honest limits</h2>
      <p>No tool makes sharing secrets risk‑free. For the best protection:</p>
      <ul class="notes plain">
        <li><b>The link is the key.</b> Anyone who gets the full link before it expires can open it. Use a single view, and add a passphrase sent through a different channel for anything sensitive.</li>
        <li><b>Check the audit log.</b> If a secret was opened by someone unexpected, treat it as exposed and change the password.</li>
        <li><b>Encryption runs in code served by this site.</b> As with any web app, you are trusting that this site serves honest code over HTTPS. VaultDrop is open and self‑hostable so that you or your organisation can run and inspect your own copy.</li>
        <li><b>Rotate when you can.</b> A shared password is best treated as temporary: ask the recipient to change it after first use.</li>
      </ul>
      <div class="actions"><a class="btn primary" href="/" data-link>Share a secret securely</a><a class="btn" href="/agents" data-link>${icon('bot')} Using it with AI agents</a></div>
    </section>`;
}

if (!window.isSecureContext || !crypto.subtle) {
  app.innerHTML = notice('alert', 'A secure connection is required', 'VaultDrop encrypts on your device, which only works over HTTPS (or on localhost). Please open this site with https://.');
} else render();
