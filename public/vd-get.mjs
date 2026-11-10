#!/usr/bin/env node
// vd-get — fetch and decrypt a VaultDrop secret from the command line (Node 20+, no dependencies).
// Made for AI agents and scripts: with --out the secret goes straight to a file and is never printed.
//
//   node vd-get.mjs '<link>' --out .secret      write to a file (mode 600), print nothing secret
//   node vd-get.mjs '<link>'                    print a text secret to stdout
//   VD_PASSPHRASE=… node vd-get.mjs '<link>'    passphrase-protected links
//
// Decryption happens locally. The key is the part of the link after '#', which is never sent to the server.
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const out = flag('--out');
const passphrase = flag('--passphrase') ?? process.env.VD_PASSPHRASE ?? '';
const link = args[0];
const die = (msg) => { console.error(`vd-get: ${msg}`); process.exit(1); };
if (!link || args.includes('--help')) die("usage: node vd-get.mjs '<link>' [--out FILE] [--passphrase TEXT | VD_PASSPHRASE=…]");

let url;
try { url = new URL(link); } catch { die('that is not a valid link'); }
const id = (url.pathname.match(/^\/p\/([\w-]{16})$/) || [])[1];
const linkKey = url.hash.slice(1);
if (!id || !/^[\w-]{43}$/.test(linkKey)) die("the link is incomplete — it must include the part after '#'. Quote it in single quotes.");

const te = new TextEncoder();
const b64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const api = async (path, init) => {
  const res = await fetch(`${url.origin}/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'User-Agent': 'vd-get/1 (command line)' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(body.error || `server answered ${res.status}`);
  return body;
};

const meta = await api(`/pushes/${id}`);
if (meta.status !== 'active') die('this secret has expired and was permanently erased');
if (meta.passphrase && !passphrase) die('this secret needs a passphrase: set VD_PASSPHRASE or pass --passphrase');

// Same derivation as the web app (public/js/crypto.js).
const salt = b64u(meta.salt);
let master = b64u(linkKey);
if (meta.passphrase) {
  const pk = await crypto.subtle.importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: meta.kdfIters }, pk, 256);
  master = new Uint8Array([...master, ...new Uint8Array(bits)]);
}
const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
const derive = (info) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, hk, 256);
const encKey = await crypto.subtle.importKey('raw', await derive('vaultdrop/enc/v1'), 'AES-GCM', false, ['decrypt']);
const auth = Buffer.from(await derive('vaultdrop/auth/v1')).toString('base64url');

const res = await api(`/pushes/${id}/view`, { method: 'POST', body: JSON.stringify({ auth }) });
const raw = new Uint8Array(Buffer.from(res.ct, 'base64'));
let plain;
try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, encKey, raw.subarray(12))); }
catch { die('could not decrypt: the link key is wrong or the data was altered'); }
const hLen = new DataView(plain.buffer).getUint32(0);
const header = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + hLen)));
const data = plain.subarray(4 + hLen, 4 + hLen + header.n);

const left = res.viewsLeft > 0 ? `${res.viewsLeft} view(s) left on the link` : 'the link is now destroyed';
if (out || header.t === 'file') {
  const target = out || basename(header.name || 'secret.bin').replace(/^\.+/, '') || 'secret.bin';
  writeFileSync(target, data, { mode: 0o600 });
  console.error(`vd-get: saved ${data.length} bytes to ${target} (not printed); ${left}`);
} else {
  process.stdout.write(Buffer.from(data));
  if (process.stdout.isTTY) process.stdout.write('\n');
  console.error(`vd-get: ${left}`);
}
