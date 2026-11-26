-- =============================================================================
-- Migration 014: lead.status pipeline — follow_up_needed, meeting_scheduled, declined
--
-- Widens the lead.status CHECK constraint to support the doctor-recruitment
-- pipeline naming: 'contacted' (offer sent, awaiting response) already
-- existed; adds 'follow_up_needed' (no response within the follow-up
-- window, up to 3 attempts), 'meeting_scheduled' (presentation booked via
-- the public booking widget), and 'declined' (3 failed attempts, no
-- meeting booked — the lead drops out of the active pipeline).
--
-- 'qualified' and 'inactive' are NOT dropped — no visibility into which
-- tenants have live rows using them (this migration was written while the
-- DB was unreachable), so this is a pure widen, not a replace. Decide their
-- disposition (repurpose vs. deprecate vs. backfill to 'declined') once
-- their actual usage can be inspected.
--
-- 'declined' has admin-only visibility, enforced in queries/lead.ts
-- (GetLeadListQuery's hideDeclined filter, GetLeadByIdQuery's role check) —
-- not a DB-level concern, no RLS/column change needed for that part.
--
-- The 10-day follow-up timer, 3-attempt counter, and rep notification that
-- drive automatic transitions into/out of 'follow_up_needed' are NOT part
-- of this migration — that needs a scheduled-job runner this codebase
-- doesn't have yet. This migration only makes the status values legal to
-- write; nothing writes them automatically yet.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: no lead row may have status IN ('follow_up_needed', 'meeting_scheduled', 'declined').
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('ALTER TABLE %I.lead DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_lead_status_check');
--       EXECUTE format(
--         'ALTER TABLE %I.lead ADD CONSTRAINT %I CHECK (status IN (''new'', ''contacted'', ''qualified'', ''inactive'', ''converted''))',
--         r.db_schema, r.db_schema||'_lead_status_check'
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
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = r.db_schema AND t.relname = 'lead' AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%status%'
    LOOP
      EXECUTE format('ALTER TABLE %I.lead DROP CONSTRAINT %I', r.db_schema, con.conname);
      EXECUTE format(
        'ALTER TABLE %I.lead ADD CONSTRAINT %I CHECK (status IN (''new'', ''contacted'', ''follow_up_needed'', ''meeting_scheduled'', ''declined'', ''qualified'', ''inactive'', ''converted''))',
        r.db_schema, con.conname
      );
    END LOOP;
  END LOOP;
END $$;
