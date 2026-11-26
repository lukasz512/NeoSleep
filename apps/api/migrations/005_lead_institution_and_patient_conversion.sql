-- =============================================================================
-- Migration 005: Lead institution capture + Lead-to-Patient conversion
--
-- Two independent changes to the `lead` table:
--   1. `institution` TEXT column — LeadForm.vue already collects this field and
--      sends it on create/update, but no column existed to store it, so the
--      API silently dropped it. This makes the round-trip real.
--   2. Widen `converted_to_type` CHECK to allow 'patient' — until now only
--      Lead->Practitioner conversion existed (ConvertLeadCommand called from
--      CreatePractitionerCommand); this unblocks the same flow for Patient.
--
-- Known gap (same tradeoff 004_first_staff_users.sql made and documented):
-- this only patches already-existing tenant schemas (neosleep, fourseasons).
-- create_tenant_schema() (001_tenant_schema.sql, re-defined in
-- 003_practitioner_drop_duplicate_salutation.sql) still creates `lead` without
-- `institution` and with the narrower CHECK. Not fixed here — same reasoning
-- as 004: no new tenant is being provisioned right now, and hand-editing that
-- ~1900-line function risks transcription errors for no immediate benefit.
--
-- ROLLBACK SQL (run only if this migration must be reversed):
-- Preconditions: any `institution` values written after this migration ran
--   are lost on rollback (column drop). Any lead converted to a patient
--   (converted_to_type = 'patient') would violate the narrowed CHECK on
--   rollback — reset those rows first or leave the CHECK widened.
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT n.nspname AS schema_name, con.conname AS constraint_name
--       FROM pg_constraint con
--       JOIN pg_class c ON c.oid = con.conrelid
--       JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE c.relname = 'lead' AND con.contype = 'c'
--         AND pg_get_constraintdef(con.oid) LIKE '%converted_to_type%'
--         AND n.nspname IN ('neosleep', 'fourseasons')
--     LOOP
--       EXECUTE format('ALTER TABLE %I.lead DROP CONSTRAINT %I', r.schema_name, r.constraint_name);
--       EXECUTE format(
--         'ALTER TABLE %I.lead ADD CONSTRAINT %I CHECK (converted_to_type IN (''practitioner'', ''organization'', NULL))',
--         r.schema_name, r.constraint_name
--       );
--       EXECUTE format('ALTER TABLE %I.lead DROP COLUMN IF EXISTS institution', r.schema_name);
--     END LOOP;
--   END $$;
-- End of rollback block
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'lead'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%converted_to_type%'
      AND n.nspname IN ('neosleep', 'fourseasons')
  LOOP
    EXECUTE format('ALTER TABLE %I.lead ADD COLUMN IF NOT EXISTS institution TEXT', r.schema_name);
    EXECUTE format('ALTER TABLE %I.lead DROP CONSTRAINT %I', r.schema_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I.lead ADD CONSTRAINT %I CHECK (converted_to_type IN (''practitioner'', ''organization'', ''patient'', NULL))',
      r.schema_name, r.constraint_name
    );
  END LOOP;
END $$;
