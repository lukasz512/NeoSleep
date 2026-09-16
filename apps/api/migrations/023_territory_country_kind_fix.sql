-- =============================================================================
-- Migration 023: fix mistyped top-level territory nodes, reparent under Global
--
-- Migration 020 back-filled `kind` for every pre-existing territory row with
-- a blanket `DEFAULT 'region'` (it only needed a level discriminator at all,
-- not a correctly-assigned one per row) — so the actual top-level nodes
-- ("México", "Polska", "Thailand") ended up typed `kind='region'` instead of
-- `kind='country'`, even though they are, in fact, the country level.
--
-- Migration 022 reparented top-level nodes under the new 'global' root by
-- matching `kind = 'country' AND parent_id IS NULL` — which this mistype
-- caused to match nothing, leaving "México"/"Polska"/"Thailand" as orphaned
-- roots outside the Global tree (path not rooted under Global's path, so
-- `<@ global_path` containment silently failed for every node under them).
--
-- Fix: any node that was a root (parent_id IS NULL) before 022 ran and isn't
-- the Global node itself IS the country level, by construction of how this
-- table has ever been seeded/used — correct its `kind`, reparent it under
-- Global, and recompute `path` for the whole tree (idempotent, same query
-- 022 already ran).
--
-- ROLLBACK: not meaningful on its own — this only corrects data 022 already
-- introduced; reversing it means reversing 022 (see that file's own rollback).
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  global_id UUID;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('SELECT id FROM %I.territory WHERE kind = ''global'' LIMIT 1', r.db_schema) INTO global_id;
    IF global_id IS NULL THEN
      CONTINUE; -- 022 hasn't run for this tenant yet — nothing to fix.
    END IF;

    EXECUTE format('UPDATE %I.territory SET kind = ''country'' WHERE parent_id IS NULL AND kind != ''global''', r.db_schema);
    EXECUTE format('UPDATE %I.territory SET parent_id = $1 WHERE kind = ''country'' AND parent_id IS NULL', r.db_schema)
      USING global_id;

    EXECUTE format('
      WITH RECURSIVE tree(id, computed_path) AS (
        SELECT id, replace(id::text, ''-'', ''_'')::extensions.ltree
        FROM %I.territory WHERE parent_id IS NULL
        UNION ALL
        SELECT t.id, (tr.computed_path || replace(t.id::text, ''-'', ''_''))::extensions.ltree
        FROM %I.territory t
        JOIN tree tr ON t.parent_id = tr.id
      )
      UPDATE %I.territory t SET path = tree.computed_path
      FROM tree WHERE t.id = tree.id', r.db_schema, r.db_schema, r.db_schema);
  END LOOP;
END $$;
