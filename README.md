# VaultDrop

End-to-end encrypted, self-destructing links for passwords, notes and files — plus a
browser-only security toolkit. No dependencies: one Node.js process and a SQLite file.

## Run

```bash
npm start
```

Open http://localhost:3000. Requires Node.js 22.13 or newer.

```bash
npm test
```

Or with Docker:

```bash
docker build -t vaultdrop . && docker run -p 3000:3000 -v vaultdrop-data:/app/data vaultdrop
```

**Production must be served over HTTPS** (put it behind Caddy, nginx or a load balancer and set
`TRUST_PROXY=1`). Browsers only allow the Web Crypto API on HTTPS or localhost.

## Features

- Share a password/text (up to 64 KB) or a file (default up to 5 MB)
- Expires after N views or N days, whichever comes first; then the ciphertext is erased
- Optional passphrase, optional "recipient may destroy" button
- Confirmation step before reveal, so link previews and scanners don't burn views
- Owner audit log (time, IP, browser of each view / failed attempt) and early destroy
- "My secrets" dashboard (owner tokens kept in the creating browser's localStorage)
- QR code for the link, light/dark theme, mobile layout
- Toolkit (all client-side): password / passphrase / token generator, strength estimate with
  Have I Been Pwned k-anonymity breach check, passphrase text encryptor, TOTP 2FA generator,
  hash & HMAC with checksum compare, JWT inspector, Base64/hex/URL encoder

## Security design

| Layer | What it does |
|---|---|
| Client-side AES-256-GCM | The browser generates a 256-bit link key and encrypts before upload. The key sits in the URL `#fragment`, which is never sent to the server. |
| Key derivation | `master = linkKey ‖ PBKDF2-SHA256(passphrase, 310k)` (passphrase part optional). HKDF-SHA256 splits it into an encryption key (stays in the browser) and a retrieval token. |
| Retrieval token | The server stores only `SHA-256(token)` and releases ciphertext only when the token is presented. Wrong passphrases don't consume views and are rate-limited. |
| Padding | Plaintext is padded to 512-byte / 4 KB buckets so short-secret length isn't revealed. File names are inside the ciphertext. |
| At-rest wrap | Stored ciphertext is encrypted again with AES-256-GCM under a per-record key (HKDF of a server master key). A database dump without the key is useless. |
| Erasure | On expiry the blob is set to NULL with SQLite `secure_delete` on and the WAL truncated. Metadata and audit rows are purged after `AUDIT_RETENTION_DAYS`. |
| HTTP hardening | Strict CSP (`default-src 'none'`, no inline script/style), `no-referrer`, `no-store` on the API, HSTS, frame denial, per-IP rate limits, body size limits. |

The server never has the plaintext, link key or passphrase. What it does hold: ciphertext until
expiry, expiry settings, token hashes and the audit log.

Limits worth knowing: anyone holding the full link (and passphrase, if set) before expiry can read
the secret; and, as with any web app, users trust the JavaScript this server delivers — which is why
it is small, dependency-free and self-hostable.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address |
| `DATA_DIR` | `./data` | SQLite database and `master.key` |
| `VAULTDROP_MASTER_KEY` | auto-generated file | 32-byte base64 at-rest key. Set it from a secret manager to keep the key off the data disk. |
| `TRUST_PROXY` | off | `1` to read the client IP from `X-Forwarded-For` (only behind your own proxy) |
| `MAX_DAYS` / `MAX_VIEWS` | `90` / `100` | Upper bounds offered to users |
| `MAX_FILE_MB` | `5` | File size limit |
| `AUDIT_RETENTION_DAYS` | `30` | How long audit records outlive an erased secret |

Back up `master.key` (or the env value) together with the database: without it, active secrets
cannot be served. Losing both simply expires everything.

## Layout

```
server.js            HTTP server, API, storage, at-rest encryption, janitor
public/js/crypto.js  client-side encryption (the part worth auditing first)
public/js/app.js     pages: share, reveal, audit, my secrets, security
public/js/tools.js   security toolkit
public/vendor/       qrcode-generator (MIT), EFF long word list (CC BY 3.0 US)
test/api.test.js     API tests
```
