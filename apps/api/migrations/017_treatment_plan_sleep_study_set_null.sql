-- =============================================================================
-- Migration 017: treatment_plan.sleep_study_id — CASCADE → SET NULL on delete
--
-- Admin-only sleep_study hard delete (see commands/sleepStudy.ts,
-- DeleteSleepStudyCommand) previously cascade-deleted any treatment_plan
-- (OrthoApnea) row linked via sleep_study_id — product decision (2026-09-02):
-- deleting a mistaken/test sleep study should NOT take an OrthoApnea plan
-- down with it. The plan survives with sleep_study_id set to NULL instead.
--
-- Column must allow NULL for ON DELETE SET NULL to ever apply — dropping
-- NOT NULL does not relax anything at INSERT time: CreateTreatmentPlanCommand
-- (apps/api/src/commands/treatmentPlan.ts) still requires a sleep_study_id
-- when a plan is first created. NULL only appears later, as a consequence of
-- the study it pointed to being deleted.
--
-- Constraint name looked up dynamically (not assumed) — it was created
-- inline in 003_practitioner_drop_duplicate_salutation.sql's
-- create_tenant_schema() without an explicit name, so Postgres's default-
-- naming convention isn't guaranteed to be what's actually in each schema.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: no treatment_plan row may have sleep_study_id IS NULL —
--   restoring NOT NULL will fail otherwise. Any row nulled out by this
--   migration's new behavior has no recoverable original value.
--   DO $$
--   DECLARE r RECORD; con RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       FOR con IN
--         SELECT c.conname FROM pg_constraint c
--         JOIN pg_class t ON t.oid = c.conrelid
--         JOIN pg_namespace n ON n.oid = t.relnamespace
--         WHERE n.nspname = r.db_schema AND t.relname = 'treatment_plan' AND c.contype = 'f'
--           AND pg_get_constraintdef(c.oid) LIKE '%sleep_study_id%'
--       LOOP
--         EXECUTE format('ALTER TABLE %I.treatment_plan DROP CONSTRAINT %I', r.db_schema, con.conname);
--       END LOOP;
--       EXECUTE format('ALTER TABLE %I.treatment_plan ALTER COLUMN sleep_study_id SET NOT NULL', r.db_schema);
--       EXECUTE format(
--         'ALTER TABLE %I.treatment_plan ADD CONSTRAINT %I FOREIGN KEY (sleep_study_id) REFERENCES %I.sleep_study(id) ON DELETE CASCADE',
--         r.db_schema, r.db_schema||'_treatment_plan_sleep_study_fkey', r.db_schema
--       );
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  con RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.treatment_plan ALTER COLUMN sleep_study_id DROP NOT NULL', r.db_schema);

    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = r.db_schema AND t.relname = 'treatment_plan' AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE '%sleep_study_id%'
    LOOP
      EXECUTE format('ALTER TABLE %I.treatment_plan DROP CONSTRAINT %I', r.db_schema, con.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE %I.treatment_plan ADD CONSTRAINT %I FOREIGN KEY (sleep_study_id) REFERENCES %I.sleep_study(id) ON DELETE SET NULL',
      r.db_schema, r.db_schema||'_treatment_plan_sleep_study_fkey', r.db_schema
    );
  END LOOP;
END $$;
