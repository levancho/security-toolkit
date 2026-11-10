/**
 * VaultDrop on Cloudflare Workers + D1.
 * Same API and trust model as server.js: the Worker only ever sees ciphertext, stores it wrapped in a second
 * AES-256-GCM layer keyed from the VAULTDROP_MASTER_KEY secret, and releases it only to callers who prove
 * they hold the link key. Static files come from the ./public assets binding.
 */
import { Buffer } from 'node:buffer';

const te = new TextEncoder();
const CHUNK = 1_200_000; // D1 values are capped at 2 MB; wrapped ciphertext is stored as base64 chunks

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:",
    "connect-src 'self' https://api.pwnedpasswords.com", "font-src 'self'", "manifest-src 'self'", "worker-src 'self'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Robots-Tag': 'noindex, nofollow',
};
const SPA_ROUTE = /^\/(p\/[A-Za-z0-9_-]{16}(\/admin)?|tools(\/[a-z-]+)?|security|pushes|agents|faq)$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const limits = (env) => ({
  maxDays: Number(env.MAX_DAYS || 90),
  maxViews: Number(env.MAX_VIEWS || 100),
  maxTextBytes: 64 * 1024,
  maxFileBytes: Number(env.MAX_FILE_MB || 5) * 1024 * 1024,
  auditRetentionDays: Number(env.AUDIT_RETENTION_DAYS || 30),
});

// ---------------------------------------------------------------- crypto --
const sha256Hex = async (bytes) => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
const B64U_RE = /^[A-Za-z0-9_-]+$/;
function fromB64u(s, len) {
  if (typeof s !== 'string' || !B64U_RE.test(s)) return null;
  const b = Buffer.from(s, 'base64url');
  return len && b.length !== len ? null : b;
}
async function tokenMatches(token, hashHex) {
  const t = fromB64u(token, 32);
  if (!t) return false;
  const a = Buffer.from(await sha256Hex(t), 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
async function recordKey(env, id) {
  const raw = Buffer.from(env.VAULTDROP_MASTER_KEY || '', 'base64');
  if (raw.length !== 32) throw new Error('VAULTDROP_MASTER_KEY secret must be 32 bytes, base64-encoded');
  const hk = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(`vaultdrop/at-rest/v1/${id}`) },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function wrap(env, id, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(id) }, await recordKey(env, id), plain);
  return Buffer.concat([iv, Buffer.from(ct)]).toString('base64');
}
async function unwrap(env, id, b64) {
  const blob = Buffer.from(b64, 'base64');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: te.encode(id) }, await recordKey(env, id), blob.subarray(12));
  return Buffer.from(plain);
}

// --------------------------------------------------------------- helpers --
const clientIp = (req) => req.headers.get('CF-Connecting-IP') || '';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const auditStmt = (env, req, id, event) => env.DB.prepare('INSERT INTO audit (push_id, ts, event, ip, ua) VALUES (?,?,?,?,?)')
  .bind(id, Date.now(), event, clientIp(req), (req.headers.get('User-Agent') || '').slice(0, 200));
const endStmts = (env, id, why) => [
  env.DB.prepare('UPDATE pushes SET ended_at = ?, ended_why = ? WHERE id = ? AND ended_at IS NULL').bind(Date.now(), why, id),
  env.DB.prepare('DELETE FROM blobs WHERE push_id = ?').bind(id),
];

async function readJson(req, max) {
  if (!/^application\/json/i.test(req.headers.get('Content-Type') || '')) throw new HttpError(415, 'Content-Type must be application/json');
  if (Number(req.headers.get('Content-Length') || 0) > max) throw new HttpError(413, 'Payload too large');
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'Payload too large');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

/** Fixed-window rate limiter backed by D1 (isolates don't share memory). */
async function limited(env, req, name, max, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare(`INSERT INTO rate (k, n, reset) VALUES (?1, 1, ?2)
    ON CONFLICT(k) DO UPDATE SET n = CASE WHEN reset <= ?3 THEN 1 ELSE n + 1 END, reset = CASE WHEN reset <= ?3 THEN ?2 ELSE reset END
    RETURNING n`).bind(`${name}:${clientIp(req)}`, now + windowMs, now).first();
  return row.n > max;
}

/** Load a push and lazily expire it if its time or views have run out. */
async function load(env, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const get = () => env.DB.prepare('SELECT * FROM pushes WHERE id = ?').bind(id).first();
  let p = await get();
  if (p && !p.ended_at && (p.expires_at <= Date.now() || p.views_used >= p.views_max)) {
    await env.DB.batch(endStmts(env, id, p.views_used >= p.views_max ? 'views' : 'time'));
    p = await get();
  }
  return p || null;
}
const publicMeta = (p) => ({
  status: p.ended_at ? 'expired' : 'active',
  endedWhy: p.ended_why || null,
  kind: p.kind,
  passphrase: !!p.passphrase,
  deletable: !!p.deletable,
  salt: p.salt,
  kdfIters: p.kdf_iters,
  viewsLeft: Math.max(0, p.views_max - p.views_used),
  viewsMax: p.views_max,
  createdAt: p.created_at,
  expiresAt: p.expires_at,
  endedAt: p.ended_at || null,
});

// -------------------------------------------------------------------- API --
async function api(req, env, url) {
  const L = limits(env);
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  if (parts[1] === 'config' && method === 'GET') {
    return json(200, { maxDays: L.maxDays, maxViews: L.maxViews, maxTextBytes: L.maxTextBytes, maxFileBytes: L.maxFileBytes });
  }
  if (parts[1] !== 'pushes') throw new HttpError(404, 'Not found');

  // Create
  if (parts.length === 2 && method === 'POST') {
    if (await limited(env, req, 'create', 40, 10 * 60e3)) throw new HttpError(429, 'Too many secrets created. Try again in a few minutes.');
    const b = await readJson(req, Math.ceil(L.maxFileBytes * 1.4) + 64 * 1024);
    const kind = b.kind === 'file' ? 'file' : 'text';
    const ct = typeof b.ct === 'string' && /^[A-Za-z0-9+/]+=*$/.test(b.ct) ? Buffer.from(b.ct, 'base64') : null;
    const salt = fromB64u(b.salt, 16);
    const auth = fromB64u(b.auth, 32);
    // 12-byte IV + at least a 16-byte GCM tag. The server cannot (and must not) inspect further.
    if (!ct || ct.length < 29 || !salt || !auth) throw new HttpError(400, 'Malformed encrypted payload');
    if (ct.length > (kind === 'file' ? L.maxFileBytes : L.maxTextBytes) + 4096) throw new HttpError(413, 'Secret is too large');
    if (!intIn(b.days, 1, L.maxDays)) throw new HttpError(400, `days must be 1-${L.maxDays}`);
    if (!intIn(b.views, 1, L.maxViews)) throw new HttpError(400, `views must be 1-${L.maxViews}`);
    if (!intIn(b.kdfIters, 0, 5_000_000)) throw new HttpError(400, 'Bad kdfIters');

    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url');
    const adminToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
    const now = Date.now();
    const expiresAt = now + b.days * 86400e3;
    const wrapped = await wrap(env, id, ct);
    const stmts = [
      env.DB.prepare(`INSERT INTO pushes (id, salt, kdf_iters, auth_hash, admin_hash, kind, passphrase, deletable, views_max, created_at, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id, salt.toString('base64url'), b.kdfIters, await sha256Hex(auth), await sha256Hex(adminToken),
        kind, b.passphrase ? 1 : 0, b.deletable ? 1 : 0, b.views, now, expiresAt),
    ];
    for (let i = 0, seq = 0; i < wrapped.length; i += CHUNK, seq++) {
      stmts.push(env.DB.prepare('INSERT INTO blobs (push_id, seq, data) VALUES (?,?,?)').bind(id, seq, wrapped.slice(i, i + CHUNK)));
    }
    stmts.push(auditStmt(env, req, id, 'created'));
    await env.DB.batch(stmts);
    return json(201, { id, adminToken: adminToken.toString('base64url'), expiresAt });
  }

  const p = await load(env, parts[2]);
  if (!p) throw new HttpError(404, 'This secret does not exist or has been permanently erased.');
  const id = p.id;
  const isAdmin = () => tokenMatches(req.headers.get('X-Admin-Token'), p.admin_hash);

  // Metadata — never consumes a view, never returns ciphertext.
  if (parts.length === 3 && method === 'GET') return json(200, publicMeta(p));

  // Retrieve — consumes one view. Requires the token derived from link key (+ passphrase).
  if (parts[3] === 'view' && method === 'POST') {
    if (await limited(env, req, 'view', 120, 10 * 60e3)) throw new HttpError(429, 'Too many requests');
    const b = await readJson(req, 4096);
    if (p.ended_at) throw new HttpError(410, 'This secret has expired and was permanently erased.');
    if (!(await tokenMatches(b.auth, p.auth_hash))) {
      if (await limited(env, req, `fail:${id}`, 10, 10 * 60e3)) throw new HttpError(429, 'Too many failed attempts. Try again later.');
      await auditStmt(env, req, id, 'failed_attempt').run();
      throw new HttpError(403, p.passphrase ? 'Wrong passphrase.' : 'This link is incomplete or incorrect.');
    }
    // Claim the view atomically, so concurrent requests can never exceed the limit.
    const claimed = await env.DB.prepare(`UPDATE pushes SET views_used = views_used + 1
      WHERE id = ? AND ended_at IS NULL AND views_used < views_max AND expires_at > ? RETURNING views_used, views_max`).bind(id, Date.now()).first();
    if (!claimed) throw new HttpError(410, 'This secret has expired and was permanently erased.');
    const { results } = await env.DB.prepare('SELECT data FROM blobs WHERE push_id = ? ORDER BY seq').bind(id).all();
    const viewsLeft = claimed.views_max - claimed.views_used;
    const after = [auditStmt(env, req, id, 'viewed')];
    if (viewsLeft <= 0) after.push(...endStmts(env, id, 'views')); // wipe before responding
    await env.DB.batch(after);
    if (!results.length) throw new HttpError(410, 'This secret has expired and was permanently erased.');
    const ct = await unwrap(env, id, results.map((r) => r.data).join(''));
    return json(200, { ct: ct.toString('base64'), viewsLeft, deletable: !!p.deletable });
  }

  // Delete — by owner (admin token) or by a viewer when allowed.
  if (parts.length === 3 && method === 'DELETE') {
    if (await limited(env, req, 'delete', 60, 10 * 60e3)) throw new HttpError(429, 'Too many requests');
    let who = (await isAdmin()) ? 'owner' : null;
    if (!who && p.deletable) {
      const b = await readJson(req, 4096).catch(() => ({}));
      if (await tokenMatches(b.auth, p.auth_hash)) who = 'viewer';
    }
    if (!who) throw new HttpError(403, 'Not allowed to delete this secret.');
    if (!p.ended_at) await env.DB.batch([...endStmts(env, id, `deleted_by_${who}`), auditStmt(env, req, id, `deleted_by_${who}`)]);
    return json(200, { ok: true });
  }

  // Audit log — owner only.
  if (parts[3] === 'audit' && method === 'GET') {
    if (!(await isAdmin())) throw new HttpError(403, 'Invalid owner token.');
    const { results } = await env.DB.prepare('SELECT ts, event, ip, ua FROM audit WHERE push_id = ? ORDER BY ts DESC, rowid DESC LIMIT 200').bind(id).all();
    return json(200, { ...publicMeta(p), events: results });
  }

  throw new HttpError(404, 'Not found');
}

async function handle(req, env) {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return api(req, env, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  const spa = SPA_ROUTE.test(url.pathname);
  const res = await env.ASSETS.fetch(spa ? new Request(new URL('/', url), req) : req);
  const out = new Response(res.body, res);
  // no-transform stops Cloudflare from injecting its analytics beacon into the page: no third-party scripts here.
  out.headers.set('Cache-Control', spa || url.pathname === '/' ? 'no-store, no-transform' : 'no-cache, no-transform');
  return out;
}

export default {
  async fetch(req, env) {
    let res;
    try {
      res = await handle(req, env);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res = json(status, { error: status === 500 ? 'Internal error' : e.message });
    }
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  },

  /** Janitor: expire overdue secrets, drop old audit records and stale rate-limit rows. */
  async scheduled(_event, env) {
    const now = Date.now();
    const cutoff = now - limits(env).auditRetentionDays * 86400e3;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM blobs WHERE push_id IN (SELECT id FROM pushes WHERE ended_at IS NULL AND expires_at <= ?)').bind(now),
      env.DB.prepare("UPDATE pushes SET ended_at = ?, ended_why = 'time' WHERE ended_at IS NULL AND expires_at <= ?").bind(now, now),
      env.DB.prepare('DELETE FROM audit WHERE push_id IN (SELECT id FROM pushes WHERE ended_at IS NOT NULL AND ended_at < ?)').bind(cutoff),
      env.DB.prepare('DELETE FROM pushes WHERE ended_at IS NOT NULL AND ended_at < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM rate WHERE reset <= ?').bind(now),
    ]);
  },
};
