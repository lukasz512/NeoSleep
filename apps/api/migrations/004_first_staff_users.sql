-- =============================================================================
-- Migration 004: First real staff users (doctor + manager roles)
--
-- Adds 'doctor' to the user_roles.role CHECK constraint, renames the 'ffm'
-- role value to 'manager' (product language — "ffm" read as unclear jargon),
-- and seeds the first two real accounts:
--   - lorena.gonzalez@neosleepcare.com  (role: doctor)
--   - alfred.jan@neosleepcare.com       (role: manager)
--
-- The 'ffm' -> 'manager' rename is folded into this same constraint rebuild
-- rather than a separate migration: no row anywhere has role='ffm' yet (the
-- only seeded user before this migration is the admin), so it's a pure
-- constraint-and-lookup-label change, not a data migration.
--
-- NOTE — architecture exception: 001_tenant_schema.sql documents "Doctors and
-- patients are NOT users — they are practitioners/patients with their own auth
-- flow." This migration deliberately creates a doctor as a {tenant}.users login
-- (password auth, same as staff) instead of a practitioner (magic-link, not yet
-- built) — an explicit, confirmed decision to unblock a real login now, ahead of
-- the Stage 7 HCP-portal/practitioner-merge work. Revisit when Stage 7 starts.
--
-- Known gap: this only patches the CHECK constraint on already-existing schemas
-- (neosleep, fourseasons). create_tenant_schema() itself (001_tenant_schema.sql)
-- still hardcodes the old 5-role list (with 'ffm', not 'manager'), so a
-- brand-new tenant provisioned after this migration would need the same fixup
-- applied again. Not fixed here — no new tenant is being provisioned right now,
-- and hand-editing that ~1900-line function risked transcription errors for no
-- immediate benefit.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- Widen the role CHECK constraint on every existing tenant schema to allow
-- 'doctor' and rename 'ffm' -> 'manager'.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'user_roles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%role%'
      AND n.nspname IN ('neosleep', 'fourseasons')
  LOOP
    EXECUTE format('UPDATE %I.user_roles SET role = ''manager'' WHERE role = ''ffm''', r.schema_name);
    EXECUTE format('ALTER TABLE %I.user_roles DROP CONSTRAINT %I', r.schema_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I.user_roles ADD CONSTRAINT %I CHECK (role IN (''admin'', ''manager'', ''kam'', ''msl'', ''rep'', ''doctor''))',
      r.schema_name, r.constraint_name
    );
  END LOOP;
END $$;

-- Relabel the (currently unused by application code) platform.lookups entries
-- for this role so the key matches the real value if it's ever wired up.
UPDATE platform.lookups SET key = 'manager' WHERE type = 'user_role' AND key = 'ffm';

-- ---------------------------------------------------------------------------
-- Lorena Gonzalez — doctor
-- ---------------------------------------------------------------------------
INSERT INTO neosleep.identities (first_name, last_name, email, language, timezone)
VALUES ('Lorena', 'Gonzalez', 'lorena.gonzalez@neosleepcare.com', 'mx', 'America/Mexico_City')
ON CONFLICT (email) DO NOTHING;

INSERT INTO neosleep.users (identity_id, force_password_change, status, country_code)
SELECT id, true, 'active', 'MX'
FROM neosleep.identities
WHERE email = 'lorena.gonzalez@neosleepcare.com'
ON CONFLICT (identity_id) DO NOTHING;

INSERT INTO neosleep.user_roles (user_id, role)
SELECT u.id, 'doctor'
FROM neosleep.users u
JOIN neosleep.identities i ON i.id = u.identity_id
WHERE i.email = 'lorena.gonzalez@neosleepcare.com'
  AND NOT EXISTS (
    SELECT 1 FROM neosleep.user_roles ur
    JOIN neosleep.users u2 ON u2.id = ur.user_id
    JOIN neosleep.identities i2 ON i2.id = u2.identity_id
    WHERE i2.email = 'lorena.gonzalez@neosleepcare.com'
      AND ur.role = 'doctor'
      AND ur.region IS NULL
  );

-- ---------------------------------------------------------------------------
-- Alfred Jan — manager
-- ---------------------------------------------------------------------------
INSERT INTO neosleep.identities (first_name, last_name, email, language, timezone)
VALUES ('Alfred', 'Jan', 'alfred.jan@neosleepcare.com', 'pl', 'Europe/Warsaw')
ON CONFLICT (email) DO NOTHING;

INSERT INTO neosleep.users (identity_id, force_password_change, status, country_code)
SELECT id, true, 'active', 'PL'
FROM neosleep.identities
WHERE email = 'alfred.jan@neosleepcare.com'
ON CONFLICT (identity_id) DO NOTHING;

INSERT INTO neosleep.user_roles (user_id, role)
SELECT u.id, 'manager'
FROM neosleep.users u
JOIN neosleep.identities i ON i.id = u.identity_id
WHERE i.email = 'alfred.jan@neosleepcare.com'
  AND NOT EXISTS (
    SELECT 1 FROM neosleep.user_roles ur
    JOIN neosleep.users u2 ON u2.id = ur.user_id
    JOIN neosleep.identities i2 ON i2.id = u2.identity_id
    WHERE i2.email = 'alfred.jan@neosleepcare.com'
      AND ur.role = 'manager'
      AND ur.region IS NULL
  );
