CREATE TABLE IF NOT EXISTS pushes (
  id          TEXT PRIMARY KEY,
  salt        TEXT NOT NULL,      -- client KDF salt (public)
  kdf_iters   INTEGER NOT NULL,
  auth_hash   TEXT NOT NULL,      -- sha256(retrieval token), hex
  admin_hash  TEXT NOT NULL,      -- sha256(owner token), hex
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
-- Server-wrapped client ciphertext, base64, split into chunks. Rows are deleted the moment a secret ends.
CREATE TABLE IF NOT EXISTS blobs (push_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (push_id, seq));
CREATE TABLE IF NOT EXISTS audit (push_id TEXT NOT NULL, ts INTEGER NOT NULL, event TEXT NOT NULL, ip TEXT, ua TEXT);
CREATE INDEX IF NOT EXISTS audit_push ON audit(push_id);
CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);
