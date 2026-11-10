'use strict';
/**
 * VaultDrop server — zero dependencies (Node >= 22.13).
 *
 * Trust model: the server NEVER sees plaintext or decryption keys.
 *  - The browser encrypts with AES-256-GCM; the key lives in the URL #fragment,
 *    which browsers do not transmit.
 *  - The server stores ciphertext only, wrapped in a second AES-256-GCM layer
 *    (per-record key derived from a server master key) so a database dump alone
 *    is useless.
 *  - Ciphertext is released only to callers that prove knowledge of a token
 *    derived from the link key (+ passphrase), and is wiped on expiry.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const LIMITS = {
  maxDays: Number(process.env.MAX_DAYS || 90),
  maxViews: Number(process.env.MAX_VIEWS || 100),
  maxTextBytes: 64 * 1024,
  maxFileBytes: Number(process.env.MAX_FILE_MB || 5) * 1024 * 1024,
  auditRetentionDays: Number(process.env.AUDIT_RETENTION_DAYS || 30),
};
const MAX_BODY = Math.ceil(LIMITS.maxFileBytes * 1.4) + 64 * 1024;

// ---------------------------------------------------------------- storage --
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

function loadMasterKey() {
  if (process.env.VAULTDROP_MASTER_KEY) {
    const k = Buffer.from(process.env.VAULTDROP_MASTER_KEY, 'base64');
    if (k.length !== 32) throw new Error('VAULTDROP_MASTER_KEY must be 32 bytes, base64-encoded');
    return k;
  }
  const file = path.join(DATA_DIR, 'master.key');
  try {
    const k = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
    if (k.length !== 32) throw new Error(`${file} is corrupt`);
    return k;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const k = crypto.randomBytes(32);
    fs.writeFileSync(file, k.toString('base64') + '\n', { mode: 0o600 });
    return k;
  }
}
const MASTER_KEY = loadMasterKey();

const db = new DatabaseSync(path.join(DATA_DIR, 'vaultdrop.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA secure_delete = ON;
  CREATE TABLE IF NOT EXISTS pushes (
    id          TEXT PRIMARY KEY,
    blob        BLOB,               -- server-wrapped client ciphertext; NULL once expired
    salt        TEXT NOT NULL,      -- client KDF salt (public)
    kdf_iters   INTEGER NOT NULL,
    auth_hash   BLOB NOT NULL,      -- sha256(retrieval token)
    admin_hash  BLOB NOT NULL,      -- sha256(owner token)
    kind        TEXT NOT NULL,
    passphrase  INTEGER NOT NULL,
    deletable   INTEGER NOT NULL,
    views_max   INTEGER NOT NULL,
    views_used  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    ended_why   TEXT
  );
  CREATE TABLE IF NOT EXISTS audit (
    push_id TEXT NOT NULL, ts INTEGER NOT NULL, event TEXT NOT NULL, ip TEXT, ua TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_push ON audit(push_id);
`);

const q = {
  insert: db.prepare(`INSERT INTO pushes (id, blob, salt, kdf_iters, auth_hash, admin_hash, kind, passphrase,
    deletable, views_max, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`),
  get: db.prepare('SELECT * FROM pushes WHERE id = ?'),
  addView: db.prepare('UPDATE pushes SET views_used = views_used + 1 WHERE id = ?'),
  end: db.prepare('UPDATE pushes SET blob = NULL, ended_at = ?, ended_why = ? WHERE id = ? AND ended_at IS NULL'),
  log: db.prepare('INSERT INTO audit (push_id, ts, event, ip, ua) VALUES (?,?,?,?,?)'),
  audit: db.prepare('SELECT ts, event, ip, ua FROM audit WHERE push_id = ? ORDER BY ts DESC, rowid DESC LIMIT 200'),
  overdue: db.prepare('SELECT id FROM pushes WHERE ended_at IS NULL AND expires_at <= ?'),
  purgeAudit: db.prepare('DELETE FROM audit WHERE push_id IN (SELECT id FROM pushes WHERE ended_at IS NOT NULL AND ended_at < ?)'),
  purge: db.prepare('DELETE FROM pushes WHERE ended_at IS NOT NULL AND ended_at < ?'),
};

// --------------------------------------------------- at-rest encryption --
function recordKey(id) {
  return Buffer.from(crypto.hkdfSync('sha256', MASTER_KEY, Buffer.alloc(0), `vaultdrop/at-rest/v1/${id}`, 32));
}
function wrap(id, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', recordKey(id), iv);
  c.setAAD(Buffer.from(id));
  return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
}
function unwrap(id, blob) {
  blob = Buffer.from(blob);
  const d = crypto.createDecipheriv('aes-256-gcm', recordKey(id), blob.subarray(0, 12));
  d.setAAD(Buffer.from(id));
  d.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]);
}

// ---------------------------------------------------------------- helpers --
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const B64U_RE = /^[A-Za-z0-9_-]+$/;
function fromB64u(s, len) {
  if (typeof s !== 'string' || !B64U_RE.test(s)) return null;
  const b = Buffer.from(s, 'base64url');
  return len && b.length !== len ? null : b;
}
function tokenMatches(token, hash) {
  const t = fromB64u(token, 32);
  return !!t && crypto.timingSafeEqual(sha256(t), Buffer.from(hash));
}
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',').pop().trim();
  }
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
function audit(req, id, event) {
  q.log.run(id, Date.now(), event, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 200));
}
function endPush(id, why) {
  q.end.run(Date.now(), why, id);
}
/** Load a push and lazily expire it if its time or views have run out. */
function load(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  let p = q.get.get(id);
  if (p && !p.ended_at && (p.expires_at <= Date.now() || p.views_used >= p.views_max)) {
    endPush(id, p.views_used >= p.views_max ? 'views' : 'time');
    p = q.get.get(id);
  }
  return p || null;
}
function publicMeta(p) {
  return {
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
  };
}

// Fixed-window in-memory rate limiter.
const buckets = new Map();
function limited(req, name, max, windowMs) {
  const key = `${name}:${clientIp(req)}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) buckets.set(key, (b = { n: 0, reset: now + windowMs }));
  return ++b.n > max;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function readJson(req, max) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) {
      return reject(new HttpError(415, 'Content-Type must be application/json'));
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new HttpError(413, 'Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// -------------------------------------------------------------------- API --
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  if (parts[1] === 'config' && req.method === 'GET') {
    return send(200, { maxDays: LIMITS.maxDays, maxViews: LIMITS.maxViews, maxTextBytes: LIMITS.maxTextBytes, maxFileBytes: LIMITS.maxFileBytes });
  }
  if (parts[1] !== 'pushes') throw new HttpError(404, 'Not found');

  // Create
  if (parts.length === 2 && req.method === 'POST') {
    if (limited(req, 'create', 40, 10 * 60e3)) throw new HttpError(429, 'Too many secrets created. Try again in a few minutes.');
    const b = await readJson(req, MAX_BODY);
    const kind = b.kind === 'file' ? 'file' : 'text';
    const ct = typeof b.ct === 'string' && /^[A-Za-z0-9+/]+=*$/.test(b.ct) ? Buffer.from(b.ct, 'base64') : null;
    const salt = fromB64u(b.salt, 16);
    const auth = fromB64u(b.auth, 32);
    // 12-byte IV + at least a 16-byte GCM tag. The server cannot (and must not) inspect further.
    if (!ct || ct.length < 29 || !salt || !auth) throw new HttpError(400, 'Malformed encrypted payload');
    const cap = (kind === 'file' ? LIMITS.maxFileBytes : LIMITS.maxTextBytes) + 4096;
    if (ct.length > cap) throw new HttpError(413, 'Secret is too large');
    if (!intIn(b.days, 1, LIMITS.maxDays)) throw new HttpError(400, `days must be 1-${LIMITS.maxDays}`);
    if (!intIn(b.views, 1, LIMITS.maxViews)) throw new HttpError(400, `views must be 1-${LIMITS.maxViews}`);
    if (!intIn(b.kdfIters, 0, 5_000_000)) throw new HttpError(400, 'Bad kdfIters');

    const id = b64u(crypto.randomBytes(12));
    const adminToken = crypto.randomBytes(32);
    const now = Date.now();
    const expiresAt = now + b.days * 86400e3;
    q.insert.run(id, wrap(id, ct), b64u(salt), b.kdfIters, sha256(auth), sha256(adminToken), kind,
      b.passphrase ? 1 : 0, b.deletable ? 1 : 0, b.views, now, expiresAt);
    audit(req, id, 'created');
    return send(201, { id, adminToken: b64u(adminToken), expiresAt });
  }

  const p = load(parts[2]);
  if (!p) throw new HttpError(404, 'This secret does not exist or has been permanently erased.');
  const id = p.id;
  const isAdmin = () => tokenMatches(req.headers['x-admin-token'], p.admin_hash);

  // Metadata — never consumes a view, never returns ciphertext.
  if (parts.length === 3 && req.method === 'GET') {
    if (limited(req, 'meta', 300, 10 * 60e3)) throw new HttpError(429, 'Too many requests');
    return send(200, publicMeta(p));
  }

  // Retrieve — consumes one view. Requires the token derived from link key (+ passphrase).
  if (parts[3] === 'view' && req.method === 'POST') {
    if (limited(req, 'view', 120, 10 * 60e3)) throw new HttpError(429, 'Too many requests');
    const b = await readJson(req, 4096);
    if (p.ended_at) throw new HttpError(410, 'This secret has expired and was permanently erased.');
    if (!tokenMatches(b.auth, p.auth_hash)) {
      if (limited(req, `fail:${id}`, 10, 10 * 60e3)) throw new HttpError(429, 'Too many failed attempts. Try again later.');
      audit(req, id, 'failed_attempt');
      throw new HttpError(403, p.passphrase ? 'Wrong passphrase.' : 'This link is incomplete or incorrect.');
    }
    const ct = unwrap(id, p.blob);
    q.addView.run(id);
    audit(req, id, 'viewed');
    const viewsLeft = p.views_max - p.views_used - 1;
    if (viewsLeft <= 0) endPush(id, 'views'); // wipe before responding
    return send(200, { ct: ct.toString('base64'), viewsLeft, deletable: !!p.deletable });
  }

  // Delete — by owner (admin token) or by a viewer when allowed.
  if (parts.length === 3 && req.method === 'DELETE') {
    if (limited(req, 'delete', 60, 10 * 60e3)) throw new HttpError(429, 'Too many requests');
    let who = isAdmin() ? 'owner' : null;
    if (!who && p.deletable) {
      const b = await readJson(req, 4096).catch(() => ({}));
      if (tokenMatches(b.auth, p.auth_hash)) who = 'viewer';
    }
    if (!who) throw new HttpError(403, 'Not allowed to delete this secret.');
    if (!p.ended_at) { endPush(id, `deleted_by_${who}`); audit(req, id, `deleted_by_${who}`); }
    return send(200, { ok: true });
  }

  // Audit log — owner only.
  if (parts[3] === 'audit' && req.method === 'GET') {
    if (limited(req, 'audit', 300, 10 * 60e3)) throw new HttpError(429, 'Too many requests');
    if (!isAdmin()) throw new HttpError(403, 'Invalid owner token.');
    return send(200, { ...publicMeta(p), events: q.audit.all(id) });
  }

  throw new HttpError(404, 'Not found');
}

// ----------------------------------------------------------------- static --
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
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
const SPA_ROUTE = /^\/(p\/[A-Za-z0-9_-]{16}(\/admin)?|tools(\/[a-z-]+)?|security|pushes|agents|faq)?$/;

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let rel = decodeURIComponent(url.pathname);
  const spa = SPA_ROUTE.test(rel);
  if (spa) rel = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found');
  let stat;
  try { stat = fs.statSync(file); } catch { throw new HttpError(404, 'Not found'); }
  if (!stat.isFile()) throw new HttpError(404, 'Not found');
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': spa ? 'no-store' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : (e instanceof URIError ? 400 : 500);
    if (status === 500) console.error(e);
    if (res.headersSent) return res.destroy();
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: status === 500 ? 'Internal error' : e.message }));
  }
});
server.requestTimeout = 60e3;
server.headersTimeout = 15e3;

// ---------------------------------------------------------------- janitor --
function sweep() {
  const now = Date.now();
  for (const { id } of q.overdue.all(now)) endPush(id, 'time');
  const cutoff = now - LIMITS.auditRetentionDays * 86400e3;
  q.purgeAudit.run(cutoff);
  q.purge.run(cutoff);
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); // don't let erased ciphertext linger in the write-ahead log
}
sweep();
setInterval(sweep, 60e3).unref();

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`VaultDrop listening on http://${HOST}:${PORT}`));
}
module.exports = { server, db };
