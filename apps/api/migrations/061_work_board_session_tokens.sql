-- =============================================================================
-- Migration 061: work board session tokens (CORE-187, decision core187-r1 Q1)
--
-- docs/stories/work-board-source-of-truth.md. Claude Code sessions create and
-- hand over their tickets on the board instead of Linear. Each device gets its
-- own token, issued and revoked by a platform admin on the board; only the
-- SHA-256 of the token is stored, the plaintext is shown once. Platform schema
-- only, so create_tenant_schema() is not regenerated.
--
--   platform.work_session_token   one row per issued token (name = device)
--   work_item_event.actor_kind    + 'session'
--   work_item.source              + 'session'
--
-- ROLLBACK (manual): DROP TABLE platform.work_session_token; restore the two
--   CHECK constraints from 059 (after deleting rows that use 'session').
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.work_session_token (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  token_sha256  TEXT        NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_by    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

ALTER TABLE platform.work_item_event DROP CONSTRAINT IF EXISTS work_item_event_actor_kind_check;
ALTER TABLE platform.work_item_event ADD CONSTRAINT work_item_event_actor_kind_check
  CHECK (actor_kind IN ('human', 'agent', 'session', 'import'));

ALTER TABLE platform.work_item DROP CONSTRAINT IF EXISTS work_item_source_check;
ALTER TABLE platform.work_item ADD CONSTRAINT work_item_source_check
  CHECK (source IN ('manual', 'agent', 'session', 'linear_import', 'problem_report'));
