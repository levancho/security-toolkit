// VaultDrop client-side cryptography. Everything here runs in the browser;
// plaintext and keys never leave it.
const te = new TextEncoder();
const td = new TextDecoder();
export const KDF_ITERS = 310000; // PBKDF2-SHA256, only used when a passphrase is set

export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const toB64u = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64u = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/**
 * Derive the AES key and the retrieval token from the link key (+ optional passphrase).
 *   master = linkKey || PBKDF2(passphrase)        (passphrase part omitted if none)
 *   encKey = HKDF(master, salt, "enc")  -> AES-256-GCM, stays in the browser
 *   auth   = HKDF(master, salt, "auth") -> sent to the server to unlock the ciphertext
 * The two outputs are independent: knowing `auth` reveals nothing about `encKey`.
 */
async function deriveKeys(linkKey, passphrase, salt, iters) {
  let master = linkKey;
  if (passphrase) {
    const pk = await crypto.subtle.importKey('raw', utf8(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, pk, 256);
    master = concat(linkKey, new Uint8Array(bits));
  }
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
  const bits = (info) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) }, hk, 256);
  const [enc, auth] = await Promise.all([bits('vaultdrop/enc/v1'), bits('vaultdrop/auth/v1')]);
  const encKey = await crypto.subtle.importKey('raw', enc, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { encKey, auth: toB64u(new Uint8Array(auth)) };
}

/**
 * Encrypt a secret. `header` is small JSON metadata (type, filename…), `data` the raw bytes.
 * Plaintext layout: [u32 header length][header JSON][data][zero padding]
 * Padding hides the exact length of short secrets such as passwords.
 */
export async function seal(header, data, passphrase) {
  const linkKey = randomBytes(32);
  const salt = randomBytes(16);
  const iters = passphrase ? KDF_ITERS : 0;
  const { encKey, auth } = await deriveKeys(linkKey, passphrase, salt, iters);

  const h = utf8(JSON.stringify({ ...header, n: data.length }));
  const bucket = data.length < 4096 ? 512 : 4096;
  const total = Math.ceil((4 + h.length + data.length) / bucket) * bucket;
  const plain = new Uint8Array(total);
  new DataView(plain.buffer).setUint32(0, h.length);
  plain.set(h, 4);
  plain.set(data, 4 + h.length);

  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, plain));
  plain.fill(0);
  return { linkKey: toB64u(linkKey), salt: toB64u(salt), kdfIters: iters, auth, ct: toB64(concat(iv, ct)) };
}

/** Step 1 of opening: compute the retrieval token to present to the server. */
export async function unlock(linkKeyB64u, passphrase, saltB64u, iters) {
  return deriveKeys(fromB64u(linkKeyB64u), passphrase, fromB64u(saltB64u), iters);
}

/** Step 2: decrypt what the server returned. Throws if tampered with or the key is wrong. */
export async function open(encKey, ctB64) {
  const raw = fromB64(ctB64);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, encKey, raw.subarray(12)));
  const hLen = new DataView(plain.buffer).getUint32(0);
  const header = JSON.parse(fromUtf8(plain.subarray(4, 4 + hLen)));
  return { header, data: plain.subarray(4 + hLen, 4 + hLen + header.n) };
}

/** Uniform random integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}
