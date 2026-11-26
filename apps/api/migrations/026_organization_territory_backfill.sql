-- =============================================================================
-- Migration 026: backfill organization.territory_id from organization.region
--
-- NEO-6: the HCO edit form is dropping its legacy `region` text input in
-- favor of `territory_id` as the sole editable geographic field. Before that
-- ships, any existing `region` value needs a real path into `territory_id`
-- so it isn't silently lost once nothing writes to `region` anymore.
--
-- Matches by `territory.code` (case-insensitive) — the same convention
-- already used for country-level codes ("PL", "MX") from migration 001's
-- seed data. Checked against live data (2026-09-16): 0 organizations
-- currently have `region` set, so this is a no-op today — it exists so any
-- org created via direct API access before this ships still backfills
-- correctly, and as the reference implementation for the same technique
-- against `identities`/`encounter` if that broader migration is scoped later
-- (see the tracked follow-up ticket).
--
-- Deliberately does NOT touch the `region` column itself (no drop, no
-- deprecation) — it stays readable for `db/organization.ts`'s existing
-- filter/sort/search, which this migration does not change.
--
-- ROLLBACK: this only sets `territory_id` where it was previously NULL: to
-- undo, `UPDATE %I.organization SET territory_id = NULL WHERE region IS NOT
-- NULL` would also clear any territory_id a human legitimately set by hand
-- afterward — there is no clean automatic rollback. If this must be
-- reversed, do it by hand per affected row, not with a blanket UPDATE.
--
-- Idempotent: safe to re-run (only ever fills NULL territory_id, never
-- overwrites an existing one).
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('
      UPDATE %I.organization o
      SET territory_id = t.id
      FROM %I.territory t
      WHERE o.territory_id IS NULL
        AND o.region IS NOT NULL
        AND o.region <> ''''
        AND upper(t.code) = upper(o.region)',
      r.db_schema, r.db_schema);
  END LOOP;
END $$;
