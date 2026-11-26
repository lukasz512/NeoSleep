-- =============================================================================
-- Migration 019: treatment_plan.deleted_at — soft delete
--
-- Product decision: an admin needs to hide a treatment_plan (in practice,
-- mainly failed/abandoned OrthoApnea orders) from the patient's list without
-- destroying the local record or its partner_transaction audit trail
-- (migration 018) — a hard DELETE would cascade or orphan those rows. Same
-- soft-delete convention already used for patient (see softDeletePatient in
-- db/patient.ts): a nullable deleted_at column, every read query filters
-- deleted_at IS NULL, no separate "is_active" flag.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: none — dropping a nullable column with no dependents is
--   always safe, but any rows soft-deleted before rollback lose the
--   deleted_at marker (they become visible again) since there's nowhere else
--   that state is recorded.
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('ALTER TABLE %I.treatment_plan DROP COLUMN IF EXISTS deleted_at', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.treatment_plan ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', r.db_schema);
  END LOOP;
END $$;
