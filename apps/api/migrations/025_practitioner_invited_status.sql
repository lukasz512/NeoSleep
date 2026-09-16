-- =============================================================================
-- Migration 025: practitioner.status gains 'invited'
--
-- Fixes a status-semantics bug: ActivatePractitionerCommand
-- (commands/practitioner.ts) was flipping practitioner.status straight to
-- 'active' the instant an admin clicked "Activate" — before the doctor had
-- done anything — which then permanently blocked ever resending the invite
-- email (the command refuses to re-run once status is 'active'). See
-- docs/stories/practitioner-invite-resend.md for the full analysis.
--
-- New lifecycle: pending_approval (record exists, no email sent yet) ->
-- invited (Activate/Resend clicked, token minted, email sent, awaiting the
-- doctor) -> active (AcceptPractitionerInviteCommand actually completes
-- registration) -> inactive (unchanged, manual deactivation).
--
-- Same per-tenant-schema CHECK-constraint-rebuild shape as
-- 013_user_roles_scope.sql. No data backfill needed: no existing row can
-- hold 'invited' yet (it didn't exist before this migration), and every
-- existing 'active' row genuinely did come from a real doctor completing
-- registration under the OLD code path — reinterpreting it under the new
-- semantics as "not yet accepted" would be wrong, not more correct.
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
      WHERE n.nspname = r.db_schema AND t.relname = 'practitioner' AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%status%'
    LOOP
      EXECUTE format('ALTER TABLE %I.practitioner DROP CONSTRAINT %I', r.db_schema, con.conname);
      EXECUTE format(
        'ALTER TABLE %I.practitioner ADD CONSTRAINT %I CHECK (status IN (''pending_approval'', ''invited'', ''active'', ''inactive''))',
        r.db_schema, con.conname
      );
    END LOOP;
  END LOOP;
END $$;
