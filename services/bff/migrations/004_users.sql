-- Users and roles (admin, manager, rep). See foundation/docs (AUTOMATION_AND_COMPLIANCE, auth).
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/004_users.sql

CREATE TABLE IF NOT EXISTS tbl_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  email         TEXT NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('admin', 'manager', 'rep')),
  provider      TEXT NOT NULL DEFAULT 'google',
  provider_id   TEXT NOT NULL,
  region        TEXT,
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON tbl_users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON tbl_users (role);
