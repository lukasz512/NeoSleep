-- =============================================================================
-- Migration 028: backfill practitioner_organization from practitioner.organization_id
--
-- NEO-17: the new "Clinics" affiliation panel on the practitioner detail page
-- reads from practitioner_organization (many-to-many), which had no writer
-- until NEO-17 shipped — every existing practitioner's row there starts
-- empty even though most already have a clinic via the legacy
-- practitioner.organization_id single field. Without this backfill, any
-- practitioner with a legacy clinic set shows a confusing "not linked to any
-- clinic yet" empty state despite already having one.
--
-- Backfills one practitioner_organization row per practitioner with a
-- non-null organization_id, marked as that practitioner's primary (it was
-- their only known clinic before this feature existed). Does not touch
-- practitioner.organization_id itself — that field stays as the form's
-- existing "default clinic" input, unrelated to this table (see
-- docs/stories/pwa-medico-view.md).
--
-- Idempotent: ON CONFLICT (practitioner_id, organization_id) DO NOTHING
-- (the existing unique constraint from migration 001) makes this safe to
-- re-run. is_primary is only set true when the practitioner doesn't already
-- have a primary from actual feature use, so a re-run after someone has
-- since changed their primary via the app never overwrites that choice.
--
-- ROLLBACK: no clean automatic rollback — a blanket DELETE would also remove
-- any identical link a human created by hand afterward through the app. If
-- this must be reversed, do it by hand per affected row.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('
      INSERT INTO %I.practitioner_organization (practitioner_id, organization_id, is_primary)
      SELECT p.id, p.organization_id,
        NOT EXISTS (
          SELECT 1 FROM %I.practitioner_organization po
          WHERE po.practitioner_id = p.id AND po.is_primary = true
        )
      FROM %I.practitioner p
      WHERE p.organization_id IS NOT NULL
        AND p.deleted_at IS NULL
      ON CONFLICT (practitioner_id, organization_id) DO NOTHING',
      r.db_schema, r.db_schema, r.db_schema);
  END LOOP;
END $$;
