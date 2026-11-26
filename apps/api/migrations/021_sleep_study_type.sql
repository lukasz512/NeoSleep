-- =============================================================================
-- Migration 021: sleep_study.study_type
--
-- No "kind of study" concept existed on sleep_study before this — every study
-- was implicitly a polysomnography. Adds a type badge (list view) and a
-- picker (study form), defaulting existing/new rows to 'polysomnography' so
-- nothing changes visually for the studies that are, in fact, all PSGs today.
-- Only 'other' exists as the alternative for now — a real second study type
-- (e.g. a home sleep apnea test) can extend the CHECK constraint later
-- without a data migration, same as any other CHECK-constrained enum column
-- in this schema.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: none — a defaulted nullable-free column with no dependents.
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('ALTER TABLE %I.sleep_study DROP COLUMN IF EXISTS study_type', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Known gap (same tradeoff 010/020 documented): create_tenant_schema() in
-- 003_practitioner_drop_duplicate_salutation.sql is NOT updated here — per
-- CLAUDE.md's "never mutate old migrations" rule, a brand-new tenant
-- provisioned after this migration would need this same fixup re-applied.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.sleep_study ADD COLUMN IF NOT EXISTS study_type TEXT NOT NULL DEFAULT ''polysomnography''', r.db_schema);
    EXECUTE format('ALTER TABLE %I.sleep_study DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_sleep_study_type_check');
    EXECUTE format('
      ALTER TABLE %I.sleep_study
        ADD CONSTRAINT %I CHECK (study_type IN (''polysomnography'',''other''))',
      r.db_schema, r.db_schema||'_sleep_study_type_check');
  END LOOP;
END $$;
