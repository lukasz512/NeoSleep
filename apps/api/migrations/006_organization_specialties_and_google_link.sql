-- =============================================================================
-- Migration 005: organization.specialties + organization.google_link
--
-- Adds a specialties list (same TEXT[] vocabulary as practitioner.specialties,
-- sourced from platform.lookups type='specialty') and a Google Maps/Business
-- profile link to organization, needed by the new HCO form
-- (apps/pwa/src/config/forms/hcoForm.ts).
--
-- create_tenant_schema() (001_tenant_schema.sql) already creates both columns
-- for brand-new tenants — this migration patches every tenant schema that
-- already exists, enumerated dynamically from platform.tenants.db_schema
-- (same approach as 003_practitioner_drop_duplicate_salutation.sql's rollback
-- block) rather than hardcoding schema names, so no follow-up fixup is needed
-- if a new tenant is provisioned before or after this migration runs.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.organization ADD COLUMN IF NOT EXISTS google_link TEXT', r.db_schema);
    EXECUTE format('ALTER TABLE %I.organization ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT ''{}''::TEXT[]', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.organization USING GIN (specialties)',
      r.db_schema||'_org_specialties_gin', r.db_schema);
  END LOOP;
END $$;
