-- =============================================================================
-- Migration 020: territory.kind + territory.deleted_at
--
-- territory already exists as a self-referencing hierarchy (parent_id) with
-- name/code/country_code — built for rep-territory assignment, but with no
-- level discriminator. Reusing it (rather than adding a parallel set of flat
-- country/region/city/village/district columns on patient) for the new
-- "country > region > city > village > district" address hierarchy needed on
-- patient records: adds a `kind` column so each node can declare which level
-- it sits at, and `deleted_at` so the new admin CRUD (db/territory.ts) can
-- soft-delete a node without breaking historical FK references from
-- identities.territory_id / users.territory_id / organization.territory_id.
--
-- No new column on patient/identities: identities.territory_id already exists
-- (migration 010) and patient already reads region via its identities JOIN —
-- adding a second, patient-local territory_id would recreate the exact
-- duplication migration 010 was written to eliminate. The breadcrumb label
-- ("mx/cdmx/polanco") is computed by walking identities.territory_id up via
-- territory.parent_id (see getTerritoryPath in db/territory.ts).
--
-- Label convention going forward: territory.code should be a short per-level
-- slug (e.g. "mx", "cdmx", "polanco"), not the compound style ("PL-MZ")
-- mentioned in 001_tenant_schema.sql's original comment — the table is still
-- effectively unpopulated, so this is a convention change, not a data
-- migration.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: none — both are nullable/defaulted columns with no dependents.
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('ALTER TABLE %I.territory DROP COLUMN IF EXISTS kind', r.db_schema);
--       EXECUTE format('ALTER TABLE %I.territory DROP COLUMN IF EXISTS deleted_at', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Known gap (same tradeoff 010 documented): create_tenant_schema() in
-- 003_practitioner_drop_duplicate_salutation.sql is NOT updated here — per
-- CLAUDE.md's "never mutate old migrations" rule and 010's own precedent, a
-- brand-new tenant provisioned after this migration would need this same
-- fixup re-applied. Not fixed here since no new tenant is being provisioned
-- right now.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.territory ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT ''region''', r.db_schema);
    EXECUTE format('ALTER TABLE %I.territory DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_territory_kind_check');
    EXECUTE format('
      ALTER TABLE %I.territory
        ADD CONSTRAINT %I CHECK (kind IN (''country'',''region'',''city'',''village'',''district''))',
      r.db_schema, r.db_schema||'_territory_kind_check');

    EXECUTE format('ALTER TABLE %I.territory ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.territory (parent_id)',
      r.db_schema||'_territory_parent_idx', r.db_schema);
  END LOOP;
END $$;
