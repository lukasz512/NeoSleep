-- =============================================================================
-- Migration 011: unique index on practitioner.identity_id
--
-- insertPractitioner() (db/practitioner.ts) does
-- `INSERT INTO practitioner (...) VALUES (...) ON CONFLICT (identity_id) DO
-- NOTHING` — its own comment explains the intent: an identity that already
-- has a practitioner row (e.g. invited as a partner before, or added as an
-- HCP after) should be linked to the existing row instead of erroring. But
-- no unique constraint/index on practitioner.identity_id ever existed, so
-- Postgres rejects that INSERT outright at plan time (42P10: "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification") —
-- on every call, not just on an actual duplicate. Discovered while testing
-- the partner-invite flow (InvitePractitionerCommand calls insertPractitioner).
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.practitioner (identity_id)',
      r.db_schema || '_practitioner_identity_id_key', r.db_schema
    );
  END LOOP;
END $$;
