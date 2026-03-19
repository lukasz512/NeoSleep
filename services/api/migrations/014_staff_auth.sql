-- Staff auth: password login, remember-me, password reset.
-- tbl_users = staff only (reps, managers, admin). Doctors/patients use tbl_hcp + magic link (see docs).
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/014_staff_auth.sql

-- Password and first-login force change (for staff with provider='local')
ALTER TABLE tbl_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE tbl_users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tbl_users ADD COLUMN IF NOT EXISTS last_password_change_at TIMESTAMPTZ;

-- Remember-me: long-lived tokens so "known browser" skips login. Revocable per device.
CREATE TABLE IF NOT EXISTS tbl_remember_me_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES tbl_users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  device_info TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remember_me_user_id ON tbl_remember_me_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_remember_me_expires_at ON tbl_remember_me_tokens (expires_at);

-- Password reset: single-use tokens (delete after use). Short-lived.
CREATE TABLE IF NOT EXISTS tbl_password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES tbl_users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON tbl_password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at ON tbl_password_reset_tokens (expires_at);

COMMENT ON TABLE tbl_remember_me_tokens IS 'Long-lived tokens for "remember me"; validated by BFF, cookie holds token id+secret.';
COMMENT ON TABLE tbl_password_reset_tokens IS 'Single-use tokens for forgot-password flow; deleted after use.';
