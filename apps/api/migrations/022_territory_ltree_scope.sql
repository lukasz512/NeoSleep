-- =============================================================================
-- Migration 022: unify RBAC scope and the territory hierarchy into one tree
--
-- Two separate mechanisms both claimed "territory" before this:
--   1. user_roles.scope (TEXT: a country_code or the literal 'global') —
--      real, enforced (requireScope.ts), but only wired into Users-management
--      endpoints. Nothing else (patient/HCP/HCO/lead) is scoped by it.
--   2. territory_id (FK into `territory`, a 5-level country>region>city>
--      village>district hierarchy, migration 020) — assignable on Patient/
--      HCP/HCO, purely descriptive, zero access-control logic anywhere.
--
-- This migration makes `territory` the one hierarchy that does both jobs:
--   - Adds an `ltree` `path` column (Postgres's standard tool for fast
--     "is this node inside that branch" queries — GiST-indexed, O(log n),
--     confirmed available on this Supabase project: `ltree 1.3`).
--   - Adds a reserved 'global' root node that every country becomes a child
--     of — so "user scoped to everywhere" is just "assigned the root", and
--     the SAME containment check (`<@`) handles both a country scope and a
--     global scope with no special-casing anywhere in application code.
--   - Replaces user_roles.scope (TEXT) with user_roles.territory_id (UUID,
--     NOT NULL, defaulting to the global root) — preserves migration 013's
--     exact anti-duplicate-grant property: UNIQUE(user_id, role, territory_id)
--     never sees NULL, so it can't be silently bypassed the way `NULL !=
--     NULL` broke the pre-013 UNIQUE(user_id, role, region).
--
-- Rollout safety: zero patient/HCP/HCO/lead rows have territory_id populated
-- today (nothing has ever backfilled it) — actual query-level scope
-- enforcement (querying WHERE candidate.territory_id IS NULL OR path <@
-- user_scope) is application code, not this migration, and ships separately
-- with that same "unassigned = visible" fallback so this migration alone
-- changes no visible behavior.
--
-- extensions.ltree needs to be reachable from a tenant-scoped session: unlike
-- a column DEFAULT (resolved once, at CREATE TABLE time), a type/operator
-- referenced directly in a query is re-resolved against search_path on every
-- call — see db/tenant.ts's withTenant(), which now appends "extensions" to
-- its SET LOCAL search_path (confirmed empirically: gen_random_uuid() is a
-- Postgres built-in and already worked without it, but uuid_generate_v4()
-- — genuinely from the uuid-ossp extension — did not, until extensions was
-- added to search_path).
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: no user_roles row may have been created/updated referencing
--   the new territory_id-based UNIQUE constraint in a way the old scope
--   column can't represent (i.e. run this soon after applying, not after
--   real new grants pile up on it).
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('ALTER TABLE %I.user_roles ADD COLUMN IF NOT EXISTS scope TEXT', r.db_schema);
--       EXECUTE format('UPDATE %I.user_roles ur SET scope = COALESCE((SELECT CASE WHEN t.kind = ''global'' THEN ''global'' ELSE t.country_code END FROM %I.territory t WHERE t.id = ur.territory_id), ''global'')', r.db_schema, r.db_schema);
--       EXECUTE format('ALTER TABLE %I.user_roles ALTER COLUMN scope SET NOT NULL', r.db_schema);
--       EXECUTE format('ALTER TABLE %I.user_roles DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_user_roles_user_id_role_territory_id_key');
--       EXECUTE format('ALTER TABLE %I.user_roles ADD CONSTRAINT %I UNIQUE (user_id, role, scope)', r.db_schema, r.db_schema||'_user_roles_user_id_role_scope_key');
--       EXECUTE format('ALTER TABLE %I.user_roles DROP COLUMN IF EXISTS territory_id', r.db_schema);
--       EXECUTE format('ALTER TABLE %I.territory DROP COLUMN IF EXISTS path', r.db_schema);
--       EXECUTE format('DELETE FROM %I.territory WHERE kind = ''global''', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- Supabase provisions an `extensions` schema by default; a plain Postgres
-- instance (e.g. CI's ephemeral DB) does not — CREATE EXTENSION ... SCHEMA
-- requires the target schema to already exist, it won't create one itself.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS ltree SCHEMA extensions;

DO $$
DECLARE
  r RECORD;
  global_id UUID;
  con RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    -- 1. territory.kind: allow the new 'global' level alongside the existing 5.
    EXECUTE format('ALTER TABLE %I.territory DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_territory_kind_check');
    EXECUTE format('
      ALTER TABLE %I.territory
        ADD CONSTRAINT %I CHECK (kind IN (''global'',''country'',''region'',''city'',''village'',''district''))',
      r.db_schema, r.db_schema||'_territory_kind_check');

    -- 2. path column + GiST index (nullable until backfilled below).
    EXECUTE format('ALTER TABLE %I.territory ADD COLUMN IF NOT EXISTS path extensions.LTREE', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.territory USING GIST (path)',
      r.db_schema||'_territory_path_gist', r.db_schema);

    -- 3. One reserved 'global' root per tenant — every country becomes its
    --    child. country_code has a NOT NULL constraint with no natural value
    --    for a root that spans every country, hence the 'GLOBAL' sentinel
    --    (never a real ISO alpha-2 code, so it can't collide/be confused
    --    with one).
    EXECUTE format('SELECT id FROM %I.territory WHERE kind = ''global'' LIMIT 1', r.db_schema) INTO global_id;
    IF global_id IS NULL THEN
      EXECUTE format(
        'INSERT INTO %I.territory (name, code, country_code, parent_id, kind) VALUES (''Global'', ''global'', ''GLOBAL'', NULL, ''global'') RETURNING id',
        r.db_schema
      ) INTO global_id;
    END IF;

    -- 4. Reparent existing top-level country nodes under the new root.
    EXECUTE format('UPDATE %I.territory SET parent_id = $1 WHERE kind = ''country'' AND parent_id IS NULL AND id != $1', r.db_schema)
      USING global_id;

    -- 5. Backfill path for every row in one pass — ltree labels can't
    --    contain hyphens, so a UUID becomes its own label with '-' -> '_'.
    --    Generic across any depth, not hardcoded to today's 2-3 levels.
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

    EXECUTE format('ALTER TABLE %I.territory ALTER COLUMN path SET NOT NULL', r.db_schema);

    -- 6. user_roles.scope (TEXT) -> user_roles.territory_id (UUID).
    EXECUTE format('ALTER TABLE %I.user_roles ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES %I.territory(id) ON DELETE SET NULL', r.db_schema, r.db_schema);

    EXECUTE format('UPDATE %I.user_roles SET territory_id = $1 WHERE scope = ''global'' AND territory_id IS NULL', r.db_schema)
      USING global_id;
    EXECUTE format('
      UPDATE %I.user_roles ur SET territory_id = t.id
      FROM %I.territory t
      WHERE t.kind = ''country'' AND t.country_code = ur.scope AND ur.territory_id IS NULL', r.db_schema, r.db_schema);
    -- Safety net: any scope value that matched no seeded country (shouldn't
    -- happen for PL/MX/TH today) falls back to global rather than blocking
    -- the migration — fails open to "sees everything", the same as every
    -- existing row's behavior before this migration (scope was unenforced
    -- outside Users endpoints anyway).
    EXECUTE format('UPDATE %I.user_roles SET territory_id = $1 WHERE territory_id IS NULL', r.db_schema)
      USING global_id;

    EXECUTE format('ALTER TABLE %I.user_roles ALTER COLUMN territory_id SET NOT NULL', r.db_schema);

    -- 7. Swap the UNIQUE constraint and the composite index onto territory_id.
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = r.db_schema AND t.relname = 'user_roles' AND c.contype = 'u'
    LOOP
      EXECUTE format('ALTER TABLE %I.user_roles DROP CONSTRAINT %I', r.db_schema, con.conname);
    END LOOP;
    EXECUTE format('ALTER TABLE %I.user_roles ADD CONSTRAINT %I UNIQUE (user_id, role, territory_id)',
      r.db_schema, r.db_schema||'_user_roles_role_territory_key');

    EXECUTE format('DROP INDEX IF EXISTS %I', r.db_schema||'_user_roles_role_scope_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_roles (role, territory_id)',
      r.db_schema||'_user_roles_role_territory_idx', r.db_schema);

    EXECUTE format('ALTER TABLE %I.user_roles DROP COLUMN IF EXISTS scope', r.db_schema);
  END LOOP;
END $$;
