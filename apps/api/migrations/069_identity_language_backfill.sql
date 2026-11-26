-- =============================================================================
-- Migration 069: identities.language is the single source of mail language (CORE-261)
--
-- Before CORE-261 a staff user created under a territory (e.g. Mexico) got an
-- empty identities.region and the default language 'en', so their mail fell
-- back to Polish. From now on creating a user sets region and language from
-- the territory (db/users.ts insertStaffUser). This backfills the accounts
-- that already exist:
--   1. empty region  -> country of the user's role territory (or identity
--      territory), only PL / MX;
--   2. language 'en' on a PL / MX identity -> pl / mx. The default 'en' was
--      never visible or chosen in the UI, so it carries no intent.
-- Identities with any other language, or a region outside PL / MX, are not
-- touched. Admins can change both on the user, HCP and patient screens.
--
-- Data only, so create_tenant_schema() is not regenerated.
--
-- ROLLBACK SQL: not reversible per row (the old values are not kept); to undo
--   set the language of the affected identities by hand on their detail screen.
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
      -- 1. region from the territory's country
      EXECUTE format(
        $q$
        UPDATE %1$I.identities i
           SET region = c.country_code, updated_at = now()
          FROM (
            SELECT DISTINCT ON (u.identity_id) u.identity_id, t.country_code
              FROM %1$I.users u
              JOIN %1$I.user_roles ur ON ur.user_id = u.id
              JOIN %1$I.territory t ON t.id = ur.territory_id
             WHERE t.country_code IN ('PL', 'MX')
             ORDER BY u.identity_id, ur.created_at
          ) c
         WHERE i.id = c.identity_id
           AND (i.region IS NULL OR btrim(i.region) = '')
        $q$,
        r.db_schema
      );
      -- 2. language from the region, only where it still sits on the default
      EXECUTE format(
        $q$
        UPDATE %1$I.identities
           SET language = CASE upper(btrim(region)) WHEN 'PL' THEN 'pl' ELSE 'mx' END,
               updated_at = now()
         WHERE language = 'en' AND upper(btrim(region)) IN ('PL', 'MX')
        $q$,
        r.db_schema
      );
    END IF;
  END LOOP;
END $$;
