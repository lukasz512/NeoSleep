-- =============================================================================
-- Migration 063: app errors become board tickets (CORE-190, decision core190-r1)
--
-- docs/stories/errors-to-board-tickets.md. Every real error kind in
-- platform.diagnostics opens one work-board ticket; the nightly worker fixes it.
-- Platform schema only, so create_tenant_schema() is not regenerated.
--
--   work_item.external_ref     'diag:<source>:<message_hash>' — one error kind, one ticket
--   work_item.source           + 'error'
--   platform.diagnostic_user   distinct affected users per error kind (hashed ids),
--                              ranks tickets for the night (D3)
--
-- ROLLBACK (manual): DROP TABLE platform.diagnostic_user; ALTER TABLE
--   platform.work_item DROP COLUMN external_ref; restore the source CHECK from 061
--   (after deleting rows that use 'error').
-- =============================================================================

ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS external_ref TEXT UNIQUE;

ALTER TABLE platform.work_item DROP CONSTRAINT IF EXISTS work_item_source_check;
ALTER TABLE platform.work_item ADD CONSTRAINT work_item_source_check
  CHECK (source IN ('manual', 'agent', 'session', 'linear_import', 'problem_report', 'error'));

CREATE TABLE IF NOT EXISTS platform.diagnostic_user (
  env           TEXT        NOT NULL,
  message_hash  TEXT        NOT NULL,
  user_hash     TEXT        NOT NULL CHECK (user_hash ~ '^[0-9a-f]{64}$'),
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (env, message_hash, user_hash)
);

CREATE INDEX IF NOT EXISTS diagnostic_user_hash_idx ON platform.diagnostic_user (message_hash);
