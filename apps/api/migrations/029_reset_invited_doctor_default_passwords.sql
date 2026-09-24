-- =============================================================================
-- Migration 029: remove the shared initial password from accounts that should
-- never have received it
--
-- NEO-51 security fix, data half. Until this branch, ensureInitialUserPasswords
-- (apps/api/src/auth.ts, runs on every API start) gave the shared initial
-- password (INITIAL_USER_PASSWORD, default "ChangeMe1!") to EVERY active users
-- row without a password. Anyone who knew such an account's email could sign
-- in (with a forced password change). The code half (same commit series)
-- limits the bootstrap to seeded staff; this migration undoes what it already
-- did to everyone else.
--
-- The bootstrap is the only code path that writes a password together with
-- force_password_change = true, so "has a password AND force_password_change"
-- identifies a password nobody chose (the shared default). Three groups:
--
--   A. Invited doctors who never completed registration (have an invite_tokens
--      row). -> password_hash NULL, status 'inactive': exactly the state a fresh
--      invite leaves them in. Their invite link (if still valid) keeps working
--      and re-sending an invite works as before. Accepting an invite sets
--      force_password_change = false, so a doctor who really registered is
--      never touched.
--   B. Any other doctor-role login still on the default password (e.g. an
--      admin-created doctor user). -> password_hash NULL only; status unchanged.
--      /auth/forgot-password ignores accounts without a password, so such a
--      doctor gets a real password through a (re-)sent partner invite.
--   C. Google sign-in accounts that the bootstrap gave the default password to
--      (the column defaults to false for them, only the bootstrap flips it).
--      -> password_hash NULL, force_password_change false; Google sign-in keeps
--      working exactly as before.
--
-- ROLLBACK: none needed and none possible — every cleared hash was the shared
-- default password, not something the user chose.
--
-- Idempotent: after it runs, no matched row has a password any more.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    -- A. invited doctors, registration not completed
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

    -- B. any other doctor still on the default password
    EXECUTE format('
      UPDATE %I.users u
      SET password_hash = NULL,
          updated_at = now()
      WHERE u.password_hash IS NOT NULL
        AND u.force_password_change = true
        AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM %I.user_roles ur WHERE ur.user_id = u.id AND ur.role = ''doctor'')',
      r.db_schema, r.db_schema);

    -- C. Google sign-in accounts given the default password
    EXECUTE format('
      UPDATE %I.users u
      SET password_hash = NULL,
          force_password_change = false,
          updated_at = now()
      WHERE u.password_hash IS NOT NULL
        AND u.force_password_change = true
        AND u.google_sub IS NOT NULL
        AND u.deleted_at IS NULL',
      r.db_schema);
  END LOOP;
END $$;
