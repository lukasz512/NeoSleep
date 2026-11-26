-- =============================================================================
-- Migration 013: user_roles.region -> user_roles.scope, NULL -> 'global'
--
-- Two problems fixed:
--
-- 1. Naming collision: `region` means two different things on two adjacent
--    tables — on identities/practitioner/lead/patient/organization it's the
--    record's business/geography attribute (feeds jurisdiction inference in
--    commands/invitePractitioner.ts), on user_roles it's the RBAC access
--    scope. Same word, different meaning, one table join away — renamed to
--    `scope` here so it can never be confused with identities.region again.
--    identities.region is NOT touched by this migration.
--
-- 2. NULL-means-global was unenforceable: SQL treats NULL as distinct from
--    NULL, so UNIQUE(user_id, role, region) never actually stopped two
--    (user_id, 'admin', NULL) rows from being inserted — a silent duplicate-
--    grant hole for the highest-risk role. An explicit 'global' literal is
--    a real value the UNIQUE constraint can compare, closing that hole.
--
-- Also folded in: `granted_by` (who granted the role — ISO 27001 A.9.2.5
-- access-review trail, was missing entirely), a (role, scope) index for the
-- "list all global admins" / "list all managers in PE" queries this enables,
-- and a fix for a pre-existing constraint drift — migration 004 renamed
-- role 'ffm' -> 'manager' but the live neosleep schema's CHECK constraint
-- still listed 'ffm' (rebuilt here as one shot instead of hunting the
-- original loop's failure).
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: no row may have scope other than 'global' or a two-letter
--   country_code (if country-scoped rows exist, they'd collapse to NULL —
--   acceptable, since NULL already meant "unenforced" before this migration).
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('ALTER TABLE %I.user_roles DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_user_roles_scope_check');
--       EXECUTE format('ALTER TABLE %I.user_roles ALTER COLUMN scope DROP NOT NULL', r.db_schema);
--       EXECUTE format('ALTER TABLE %I.user_roles ALTER COLUMN scope DROP DEFAULT', r.db_schema);
--       EXECUTE format('UPDATE %I.user_roles SET scope = NULL WHERE scope = ''global''', r.db_schema);
--       EXECUTE format('ALTER TABLE %I.user_roles RENAME COLUMN scope TO region', r.db_schema);
--       EXECUTE format('ALTER TABLE %I.user_roles DROP COLUMN IF EXISTS granted_by', r.db_schema);
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
    -- 1. Rename region -> scope (RENAME COLUMN carries UNIQUE(user_id,role,region)
    --    forward as UNIQUE(user_id,role,scope) automatically — no need to touch it).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = r.db_schema AND table_name = 'user_roles' AND column_name = 'region'
    ) THEN
      EXECUTE format('ALTER TABLE %I.user_roles RENAME COLUMN region TO scope', r.db_schema);
    END IF;

    -- 2. Backfill NULL -> 'global', then enforce NOT NULL.
    EXECUTE format('UPDATE %I.user_roles SET scope = ''global'' WHERE scope IS NULL', r.db_schema);
    EXECUTE format('ALTER TABLE %I.user_roles ALTER COLUMN scope SET DEFAULT ''global''', r.db_schema);
    EXECUTE format('ALTER TABLE %I.user_roles ALTER COLUMN scope SET NOT NULL', r.db_schema);

    -- 3. granted_by (access-grant audit trail).
    EXECUTE format(
      'ALTER TABLE %I.user_roles ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES %I.users(id) ON DELETE SET NULL',
      r.db_schema, r.db_schema
    );

    -- 4. Rebuild the role CHECK constraint: add 'doctor'/'manager' (matching
    --    001_tenant_schema.sql's current canonical list), drop stale 'ffm'.
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = r.db_schema AND t.relname = 'user_roles' AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%role%'
    LOOP
      EXECUTE format('UPDATE %I.user_roles SET role = ''manager'' WHERE role = ''ffm''', r.db_schema);
      EXECUTE format('ALTER TABLE %I.user_roles DROP CONSTRAINT %I', r.db_schema, con.conname);
      EXECUTE format(
        'ALTER TABLE %I.user_roles ADD CONSTRAINT %I CHECK (role IN (''admin'', ''manager'', ''kam'', ''msl'', ''rep'', ''doctor''))',
        r.db_schema, con.conname
      );
    END LOOP;

    -- 5. Composite index for scope-filtered role lookups (admin/manager rosters per country).
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_roles (role, scope)',
      r.db_schema||'_user_roles_role_scope_idx', r.db_schema);
  END LOOP;
END $$;
