-- =============================================================================
-- Migration 024: territory.path gets a placeholder DEFAULT
--
-- Migration 022 made `path` NOT NULL with no DEFAULT — every INSERT has to
-- name it explicitly, which db/territory.ts's insertTerritory() doesn't
-- (it inserts the row first, then calls recomputeTerritorySubtreePath() to
-- fill path in from the real parent chain — see that function's own doc
-- comment for why this is application code, not a trigger). Without a
-- DEFAULT, that first INSERT itself fails NOT NULL before the recompute ever
-- runs. A harmless placeholder default closes that gap; it's always
-- overwritten with the real path in the same request, before any other query
-- can observe the row.
--
-- ROLLBACK: `ALTER TABLE territory ALTER COLUMN path DROP DEFAULT` per tenant
-- schema — safe any time, nothing depends on the default persisting.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('ALTER TABLE %I.territory ALTER COLUMN path SET DEFAULT ''unset''::extensions.ltree', r.db_schema);
  END LOOP;
END $$;
