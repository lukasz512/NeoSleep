-- =============================================================================
-- Migration 045: organization.country_code follows its territory (NEO-210)
--
-- The clinic form never showed country_code and defaulted it to the creating
-- user's country, so a clinic in Estado de México saved by a PL user became
-- PL and the lab order was rejected for a wrong delivery country. From now on
-- db/organization.ts copies the country of the nearest territory (itself or an
-- ancestor) that has one on every insert/update; this one-time backfill does
-- the same for existing rows. Clinics without a territory keep their value.
--
-- Data-only (no tenant-table change) → create_tenant_schema() is unchanged.
-- Numbers 043/044 are taken on dev / an open branch.
--
-- ROLLBACK: none needed — the old values were wrong; nothing reads them back.
-- =============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants LOOP
    IF to_regclass(format('%I.organization', r.db_schema)) IS NULL
       OR to_regclass(format('%I.territory', r.db_schema)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format($f$
      UPDATE %1$I.organization o
         SET country_code = sub.country_code
        FROM (
          SELECT DISTINCT ON (t.id) t.id AS territory_id, a.country_code
            FROM %1$I.territory t
            JOIN %1$I.territory a ON t.path OPERATOR(extensions.<@) a.path
           WHERE NULLIF(a.country_code, '') IS NOT NULL
           ORDER BY t.id, extensions.nlevel(a.path) DESC
        ) sub
       WHERE o.territory_id = sub.territory_id
         AND o.country_code IS DISTINCT FROM sub.country_code
    $f$, r.db_schema);
  END LOOP;
END $$;
