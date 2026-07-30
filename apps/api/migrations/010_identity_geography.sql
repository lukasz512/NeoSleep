-- =============================================================================
-- Migration 010: Consolidate region/territory_id/country_code onto identities
--
-- users, practitioner, patient and lead each had their own region/territory_id/
-- country_code columns — the same "home region of this person" concept,
-- duplicated four times. identities is the shared TPT base for all four, so
-- it becomes the single source of truth; application code (db/users.ts,
-- db/practitioner.ts, db/patient.ts, db/lead.ts) now reads/writes these
-- fields via the identities JOIN each of those files already has.
--
-- NOT touched: user_roles.region. That is a distinct concept (per-role
-- access scope — one user can hold the same role in multiple regions, or
-- NULL for "all regions", per user_roles' own column comment) and stays
-- exactly as it is.
--
-- Idempotent, safe to re-run. Backfill is COALESCE-based (never overwrites
-- an already-populated identities column), applied across all four source
-- tables in an arbitrary but harmless order — pre-launch, no real
-- conflicting production data exists yet (same precedent as ADR-011).
--
-- Known gap (same tradeoff 004/005/009 documented): create_tenant_schema()
-- in 001_tenant_schema.sql is NOT updated here — a brand-new tenant
-- provisioned after this migration would need this same fixup re-applied.
-- Not fixed here, per CLAUDE.md's "never mutate old migrations" rule and the
-- same reasoning: no new tenant is being provisioned right now, and
-- hand-editing that ~2000-line function across four separate table
-- definitions risks transcription errors for no immediate benefit.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    -- 1. Add columns to identities.
    EXECUTE format('ALTER TABLE %I.identities ADD COLUMN IF NOT EXISTS territory_id UUID', r.db_schema);
    EXECUTE format('ALTER TABLE %I.identities ADD COLUMN IF NOT EXISTS region TEXT', r.db_schema);
    EXECUTE format('ALTER TABLE %I.identities ADD COLUMN IF NOT EXISTS country_code TEXT', r.db_schema);

    EXECUTE format('ALTER TABLE %I.identities DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_identities_territory_fk');
    EXECUTE format('
      ALTER TABLE %I.identities
        ADD CONSTRAINT %I FOREIGN KEY (territory_id)
        REFERENCES %I.territory(id) ON DELETE SET NULL',
      r.db_schema, r.db_schema||'_identities_territory_fk', r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.identities (territory_id)',
      r.db_schema||'_identities_territory_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.identities (region)',
      r.db_schema||'_identities_region_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.identities (country_code)',
      r.db_schema||'_identities_country_idx', r.db_schema);

    -- 2. Backfill from each of the four child tables (COALESCE: first non-null wins, never clobbers).
    EXECUTE format('
      UPDATE %I.identities i SET
        territory_id = COALESCE(i.territory_id, u.territory_id),
        region       = COALESCE(NULLIF(i.region, ''''), NULLIF(u.region, '''')),
        country_code = COALESCE(i.country_code, u.country_code)
      FROM %I.users u WHERE u.identity_id = i.id', r.db_schema, r.db_schema);

    EXECUTE format('
      UPDATE %I.identities i SET
        territory_id = COALESCE(i.territory_id, p.territory_id),
        region       = COALESCE(NULLIF(i.region, ''''), NULLIF(p.region, '''')),
        country_code = COALESCE(i.country_code, p.country_code)
      FROM %I.practitioner p WHERE p.identity_id = i.id', r.db_schema, r.db_schema);

    EXECUTE format('
      UPDATE %I.identities i SET
        territory_id = COALESCE(i.territory_id, pt.territory_id),
        region       = COALESCE(NULLIF(i.region, ''''), NULLIF(pt.region, '''')),
        country_code = COALESCE(i.country_code, pt.country_code)
      FROM %I.patient pt WHERE pt.identity_id = i.id', r.db_schema, r.db_schema);

    EXECUTE format('
      UPDATE %I.identities i SET
        territory_id = COALESCE(i.territory_id, l.territory_id),
        region       = COALESCE(NULLIF(i.region, ''''), NULLIF(l.region, '''')),
        country_code = COALESCE(i.country_code, l.country_code)
      FROM %I.lead l WHERE l.identity_id = i.id', r.db_schema, r.db_schema);

    -- 3. Drop the now-duplicate columns from the four child tables.
    EXECUTE format('ALTER TABLE %I.users DROP COLUMN IF EXISTS territory_id', r.db_schema);
    EXECUTE format('ALTER TABLE %I.users DROP COLUMN IF EXISTS region', r.db_schema);
    EXECUTE format('ALTER TABLE %I.users DROP COLUMN IF EXISTS country_code', r.db_schema);

    EXECUTE format('ALTER TABLE %I.practitioner DROP COLUMN IF EXISTS territory_id', r.db_schema);
    EXECUTE format('ALTER TABLE %I.practitioner DROP COLUMN IF EXISTS region', r.db_schema);
    EXECUTE format('ALTER TABLE %I.practitioner DROP COLUMN IF EXISTS country_code', r.db_schema);

    EXECUTE format('ALTER TABLE %I.patient DROP COLUMN IF EXISTS territory_id', r.db_schema);
    EXECUTE format('ALTER TABLE %I.patient DROP COLUMN IF EXISTS region', r.db_schema);
    EXECUTE format('ALTER TABLE %I.patient DROP COLUMN IF EXISTS country_code', r.db_schema);

    EXECUTE format('ALTER TABLE %I.lead DROP COLUMN IF EXISTS territory_id', r.db_schema);
    EXECUTE format('ALTER TABLE %I.lead DROP COLUMN IF EXISTS region', r.db_schema);
    EXECUTE format('ALTER TABLE %I.lead DROP COLUMN IF EXISTS country_code', r.db_schema);
  END LOOP;
END $$;
