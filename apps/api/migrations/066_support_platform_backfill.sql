-- =============================================================================
-- Migration 066: platform access for existing Support users (CORE-209)
--
-- Since CORE-209 the Users screen keeps platform.users in step with role
-- 'support' (db/platformAdmin.ts syncSupportPlatformAccess). The users given
-- role Support before that (CORE-197, set by Łukasz) have no platform.users
-- row, so they don't see the Errors tab or the work board. This adds one for
-- every active, not deleted 'support' user in every tenant, unless the email
-- already has a platform row of any role.
--
-- Platform schema only, so create_tenant_schema() is not regenerated.
--
-- ROLLBACK SQL: none needed; switch a row off with
--   UPDATE platform.users SET is_active = false WHERE lower(email) = lower('<email>') AND role = 'support';
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = r.db_schema AND table_name = 'user_roles') THEN
      EXECUTE format(
        $q$
        INSERT INTO platform.users (email, name, role)
        SELECT DISTINCT ON (lower(i.email)) lower(i.email), concat_ws(' ', i.first_name, i.last_name), 'support'
          FROM %1$I.users u
          JOIN %1$I.identities i ON i.id = u.identity_id
          JOIN %1$I.user_roles ur ON ur.user_id = u.id AND ur.role = 'support'
         WHERE u.deleted_at IS NULL AND u.status = 'active' AND i.email IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM platform.users p WHERE lower(p.email) = lower(i.email))
        $q$,
        r.db_schema
      );
    END IF;
  END LOOP;
END $$;
