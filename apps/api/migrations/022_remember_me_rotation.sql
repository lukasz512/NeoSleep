-- =============================================================================
-- Migration 022: remember_me_tokens — recreated for refresh-token rotation
--
-- See ADR-020 (docs/ADR-020-auth-token-rotation-no-cookies.md) for the full
-- decision. Summary: the auth model moves from a single long-lived bearer
-- JWT in localStorage to a short-lived (15m) access token plus a rotating
-- refresh token, stored (hashed) in this table.
--
-- CORRECTION vs. ADR-020's original wording: this table is not simply "dead
-- code being revived" — it existed once (migration 001/003) and was
-- explicitly DROPPED in migration 012 as part of the original cookie→bearer-
-- JWT cutover (that migration's own comment: "nothing replaces this table —
-- it's simply no longer needed", confirmed with the user at the time). It
-- genuinely does not exist in any tenant schema today. This migration
-- recreates it — same shape as the original (preserved verbatim in 012's own
-- rollback block) — plus one new column, `replaced_by_id`, for the rotation
-- chain: a self-reference from an old (now-rotated) token row to the row
-- that replaced it, so reuse of a rotated-away token can be detected and the
-- whole chain revoked (theft response).
--
-- Known gap (same tradeoff 010/015/017/020/021 documented): this only
-- creates the table in already-provisioned tenant schemas (neosleep,
-- fourseasons) via the DO $$ loop below. create_tenant_schema() is not
-- edited — fold table creation into it the next time that function is
-- touched for an unrelated reason.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: none — this only drops a table this migration itself
--   created; any tokens issued while it existed are unrecoverable (same as
--   a normal session-cookie invalidation, not a data-loss concern).
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('DROP TABLE IF EXISTS %I.remember_me_tokens', r.db_schema);
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
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.remember_me_tokens (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
        token_hash     TEXT        NOT NULL UNIQUE,
        expires_at     TIMESTAMPTZ NOT NULL,
        last_used_at   TIMESTAMPTZ,
        revoked_at     TIMESTAMPTZ,
        replaced_by_id UUID        REFERENCES %I.remember_me_tokens(id),
        device_name    TEXT,
        user_agent     TEXT,
        ip_address     INET,
        metadata       JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.remember_me_tokens (token_hash)',
      r.db_schema || '_rmt_hash_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.remember_me_tokens (user_id)',
      r.db_schema || '_rmt_user_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.remember_me_tokens (expires_at)',
      r.db_schema || '_rmt_expires_idx', r.db_schema);
  END LOOP;
END $$;
