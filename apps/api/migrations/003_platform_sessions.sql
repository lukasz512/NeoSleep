-- =============================================================================
-- Migration 003: platform.sessions — Postgres-backed express-session store
--
-- Replaces the default in-memory MemoryStore (never explicitly configured,
-- so sessions were lost on every restart/redeploy and couldn't scale past
-- one instance). Cross-tenant infra, same pattern as platform.tenants/
-- platform.companies — a session isn't scoped to one tenant schema.
--
-- Table shape matches what connect-pg-simple expects by default
-- (sid/sess/expire) so no custom column mapping is needed.
--
-- ROLLBACK SQL (run only if this migration must be reversed):
-- Preconditions: none — dropping this table only means sessions revert to
--   in-memory (every logged-in user gets signed out on next restart).
--   DROP TABLE IF EXISTS platform.sessions;
-- End of rollback block
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.sessions (
  sid    TEXT PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_expire ON platform.sessions (expire);
