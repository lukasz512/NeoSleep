-- =============================================================================
-- Migration 032: practitioner.national_ids.primary -> pwz / cedula
--
-- NEO-51: the HCP form's generic "National ID" field (stored at
-- practitioner.national_ids.primary) is replaced by a country-specific
-- professional licence number — PL "numer prawa wykonywania zawodu" (key
-- `pwz`) or MX "cédula profesional" (key `cedula`), the two keys the
-- national_ids column's own comment in migration 003 already anticipated.
-- The partner agreement prints this number, so it has to live under the key
-- the renderer reads.
--
-- Moves an existing `primary` value to `pwz` when the practitioner's
-- identity region is PL, or to `cedula` when it is MX. Region lives on
-- `identities` since migration 010. Practitioners with any other/unknown
-- region keep `primary` untouched — nothing guesses a country.
--
-- Does NOT validate the moved value (PWZ checksum / cédula length) — legacy
-- free-text data may not pass; the PWA form will show the validation error
-- the next time someone edits that HCP, which is the right place to fix it
-- by hand rather than silently dropping data here.
--
-- Never overwrites an existing `pwz`/`cedula` value (if both exist, `primary`
-- is simply left in place).
--
-- ROLLBACK: `UPDATE %I.practitioner SET national_ids = (national_ids - 'pwz')
-- || jsonb_build_object('primary', national_ids->>'pwz') WHERE national_ids ?
-- 'pwz'` (and the same for 'cedula') — but that would also move any value a
-- human entered through the new form after this ran. Reverse by hand if ever
-- needed.
--
-- Idempotent: once `primary` has been moved it no longer matches the WHERE.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('
      UPDATE %I.practitioner p
      SET national_ids = (p.national_ids - ''primary'')
        || jsonb_build_object(
             CASE WHEN upper(i.region) = ''PL'' THEN ''pwz'' ELSE ''cedula'' END,
             p.national_ids->>''primary''
           ),
          updated_at = now()
      FROM %I.identities i
      WHERE i.id = p.identity_id
        AND p.national_ids ? ''primary''
        AND coalesce(trim(p.national_ids->>''primary''), '''') <> ''''
        AND upper(i.region) IN (''PL'', ''MX'')
        AND NOT (p.national_ids ? (CASE WHEN upper(i.region) = ''PL'' THEN ''pwz'' ELSE ''cedula'' END))',
      r.db_schema, r.db_schema);
  END LOOP;
END $$;
