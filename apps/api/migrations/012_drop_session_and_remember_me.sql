-- =============================================================================
-- Migration 012: drop cookie-session infrastructure — bearer-JWT auth cutover
--
-- Auth moved from express-session (platform.sessions, connect-pg-simple) +
-- a per-tenant remember_me_tokens table to a single self-contained bearer
-- JWT (see apps/api/src/utils/jwt.ts). Root cause: the frontend
-- (pwa.neosleepcare.com) and API (Render, different domain) are cross-origin,
-- and Safari/iOS blocks third-party cookies by default — the SameSite=None
-- session cookie never reliably persisted there, so a correctly logged-in
-- user could see no real session data on iPhone. Revocation (e.g. on
-- password change) now uses users.token_version (see incrementUserTokenVersion
-- in db/users.ts and buildContext in TenantContext.ts) instead of a
-- DB-backed remember-me token, so nothing replaces this table — it's simply
-- no longer needed.
--
-- This is a simple, non-zero-downtime cutover (confirmed with the user):
-- currently-logged-in cookie sessions stop working the moment this and the
-- accompanying backend deploy land — anyone logged in re-logs in once. No
-- soak window, so this drop ships in the same batch as the auth code change,
-- not after a waiting period.
--
-- ROLLBACK SQL (run only if this migration must be reversed):
-- Preconditions: any remember-me tokens/sessions that existed before this
--   drop are unrecoverable — this only restores empty tables, not lost rows.
--   CREATE TABLE IF NOT EXISTS platform.sessions (
--     sid    TEXT PRIMARY KEY,
--     sess   JSON NOT NULL,
--     expire TIMESTAMPTZ NOT NULL
--   );
--   CREATE INDEX IF NOT EXISTS idx_platform_sessions_expire ON platform.sessions (expire);
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('
--         CREATE TABLE IF NOT EXISTS %I.remember_me_tokens (
--           id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--           user_id      UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
--           token_hash   TEXT        NOT NULL UNIQUE,
--           expires_at   TIMESTAMPTZ NOT NULL,
--           last_used_at TIMESTAMPTZ,
--           revoked_at   TIMESTAMPTZ,
--           device_name  TEXT,
--           user_agent   TEXT,
--           ip_address   INET,
--           metadata     JSONB,
--           created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
--         )', r.db_schema, r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.remember_me_tokens', r.db_schema);
  END LOOP;
END $$;

DROP TABLE IF EXISTS platform.sessions;
