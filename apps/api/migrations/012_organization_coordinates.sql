-- =============================================================================
-- Migration 012: organization.latitude / organization.longitude
--
-- Geocoded from the existing address fields (see apps/api/src/services/geocoding.ts),
-- needed to place pins on the public "find a specialist" map
-- (apps/web/src/views/FindSpecialistView.vue). Nullable — populated
-- automatically going forward on organization create/update, and backfilled
-- once for existing rows by apps/api/scripts/backfill-organization-coordinates.ts.
--
-- create_tenant_schema() (001_tenant_schema.sql) already creates both columns
-- for brand-new tenants — this migration patches every tenant schema that
-- already exists, same dynamic-enumeration approach as
-- 006_organization_specialties_and_google_link.sql.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.organization ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION', r.db_schema);
    EXECUTE format('ALTER TABLE %I.organization ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION', r.db_schema);
  END LOOP;
END $$;
