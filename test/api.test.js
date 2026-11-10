'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultdrop-test-'));
const { server, db } = require('../server.js');

let base;
test.before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.close(); db.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const mk = (over = {}) => {
  const auth = crypto.randomBytes(32);
  const ct = crypto.randomBytes(540);
  return { auth: auth.toString('base64url'), ctRaw: ct, payload: { kind: 'text', ct: ct.toString('base64'), salt: crypto.randomBytes(16).toString('base64url'), auth: auth.toString('base64url'), kdfIters: 0, days: 1, views: 2, passphrase: false, deletable: true, ...over } };
};

test('create, view until exhausted, then erased', async () => {
  const s = mk();
  const c = await call('POST', '/api/pushes', s.payload);
  assert.equal(c.status, 201);
  const id = c.body.id;

  const meta = await call('GET', `/api/pushes/${id}`);
  assert.equal(meta.body.viewsLeft, 2);
  assert.equal(meta.body.ct, undefined, 'metadata never includes ciphertext');

  const bad = await call('POST', `/api/pushes/${id}/view`, { auth: crypto.randomBytes(32).toString('base64url') });
  assert.equal(bad.status, 403);
  assert.equal((await call('GET', `/api/pushes/${id}`)).body.viewsLeft, 2, 'failed attempt does not consume a view');

  const v1 = await call('POST', `/api/pushes/${id}/view`, { auth: s.auth });
  assert.equal(v1.status, 200);
  assert.ok(Buffer.from(v1.body.ct, 'base64').equals(s.ctRaw));
  const v2 = await call('POST', `/api/pushes/${id}/view`, { auth: s.auth });
  assert.equal(v2.body.viewsLeft, 0);
  assert.equal((await call('POST', `/api/pushes/${id}/view`, { auth: s.auth })).status, 410);

  const row = db.prepare('SELECT blob, ended_why FROM pushes WHERE id = ?').get(id);
  assert.equal(row.blob, null, 'ciphertext wiped');
  assert.equal(row.ended_why, 'views');
});

test('stored blob is wrapped at rest and never equals what the client sent', async () => {
  const s = mk();
  const { body } = await call('POST', '/api/pushes', s.payload);
  const row = db.prepare('SELECT blob, auth_hash FROM pushes WHERE id = ?').get(body.id);
  assert.ok(!Buffer.from(row.blob).includes(s.ctRaw.subarray(0, 32)));
  assert.ok(!Buffer.from(row.auth_hash).equals(Buffer.from(s.auth, 'base64url')), 'only a hash of the token is stored');
});

test('owner audit and delete; viewer delete honours the deletable flag', async () => {
  const s = mk({ deletable: false });
  const { body } = await call('POST', '/api/pushes', s.payload);
  assert.equal((await call('GET', `/api/pushes/${body.id}/audit`)).status, 403);
  assert.equal((await call('DELETE', `/api/pushes/${body.id}`, { auth: s.auth })).status, 403);
  const a = await call('GET', `/api/pushes/${body.id}/audit`, null, { 'X-Admin-Token': body.adminToken });
  assert.equal(a.body.events[0].event, 'created');
  assert.equal((await call('DELETE', `/api/pushes/${body.id}`, null, { 'X-Admin-Token': body.adminToken })).status, 200);
  assert.equal((await call('GET', `/api/pushes/${body.id}`)).body.endedWhy, 'deleted_by_owner');

  const s2 = mk();
  const c2 = await call('POST', '/api/pushes', s2.payload);
  assert.equal((await call('DELETE', `/api/pushes/${c2.body.id}`, { auth: s2.auth })).status, 200);
});

test('time expiry', async () => {
  const s = mk();
  const { body } = await call('POST', '/api/pushes', s.payload);
  db.prepare('UPDATE pushes SET expires_at = ? WHERE id = ?').run(Date.now() - 1, body.id);
  assert.equal((await call('POST', `/api/pushes/${body.id}/view`, { auth: s.auth })).status, 410);
  assert.equal((await call('GET', `/api/pushes/${body.id}`)).body.endedWhy, 'time');
});

test('validation and hardening', async () => {
  assert.equal((await call('POST', '/api/pushes', mk({ days: 0 }).payload)).status, 400);
  assert.equal((await call('POST', '/api/pushes', mk({ views: 101 }).payload)).status, 400);
  assert.equal((await call('POST', '/api/pushes', mk({ ct: 'AAAA' }).payload)).status, 400);
  assert.equal((await call('POST', '/api/pushes', mk({ ct: crypto.randomBytes(80000).toString('base64') }).payload)).status, 413);
  assert.equal((await call('GET', '/api/pushes/aaaaaaaaaaaaaaaa')).status, 404);
  const res = await fetch(base + '/');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404);
});
