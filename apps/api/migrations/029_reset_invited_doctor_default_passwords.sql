-- =============================================================================
-- Migration 029: remove the shared initial password from invited doctors who
-- never completed registration
--
-- NEO-51 security fix, data half. Until this branch, ensureInitialUserPasswords
-- (apps/api/src/auth.ts, runs on every API start) gave the shared initial
-- password (INITIAL_USER_PASSWORD, default "ChangeMe1!") to EVERY users row
-- without a password — including doctors invited through HCP activation, whose
-- logins were also created 'active'. Anyone who knew such a doctor's email
-- could sign in (with a forced password change) before the doctor had signed
-- the partner agreement. The code half (same commit series) stops that from
-- happening again; this migration undoes it for accounts it already hit.
--
-- Who is touched — all three must hold:
--   * the user has at least one invite_tokens row (it's an invited partner,
--     not seeded staff — seeded staff never get invite tokens);
--   * force_password_change is true (the bootstrap always sets it; accepting
--     the invite sets it to false, so a doctor who really registered is never
--     touched);
--   * the user holds the 'doctor' role.
-- For those: password_hash -> NULL and status -> 'inactive', i.e. exactly the
-- state a fresh invite leaves them in. Their invite link (if still valid)
-- keeps working, and re-sending an invite works as before.
--
-- ROLLBACK: none needed and none possible — the cleared hash was the shared
-- default password, not something the doctor chose.
--
-- Idempotent: after it runs, the matched rows have no password and no longer
-- match `password_hash IS NOT NULL`.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('
      UPDATE %I.users u
      SET password_hash = NULL,
          status = ''inactive'',
          updated_at = now()
      WHERE u.password_hash IS NOT NULL
        AND u.force_password_change = true
        AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM %I.invite_tokens it WHERE it.user_id = u.id)
        AND EXISTS (SELECT 1 FROM %I.user_roles ur WHERE ur.user_id = u.id AND ur.role = ''doctor'')',
      r.db_schema, r.db_schema, r.db_schema);
  END LOOP;
END $$;
