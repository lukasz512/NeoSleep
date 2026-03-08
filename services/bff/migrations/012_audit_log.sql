-- Audit log for lead/contact creation and other user actions. Enables reporting.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/012_audit_log.sql

CREATE TABLE IF NOT EXISTS tbl_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    UUID REFERENCES tbl_users (id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id  TEXT,
  metadata   JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON tbl_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON tbl_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON tbl_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON tbl_audit_log (entity_type);
