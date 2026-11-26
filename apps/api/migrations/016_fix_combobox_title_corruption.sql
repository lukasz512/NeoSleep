-- =============================================================================
-- Migration 016: repair identities.title values corrupted by a VCombobox bug
--
-- apps/pwa/src/components/FormRenderer.vue's VCombobox binding (used by the
-- "title"/salutation prefix field in identityFields.ts, shared by every
-- lead/practitioner/patient/user form) emitted the raw selected option
-- object instead of resolving it through itemValue when a user picked an
-- item from the dropdown (free-typed text was unaffected). node-postgres
-- JSON.stringifies plain-object query parameters for a TEXT column, so any
-- record whose prefix was picked from the dropdown (not typed) ended up with
-- identities.title literally set to e.g. '{"title":"Sra.","value":"Sra."}'
-- instead of 'Sra.'. Fixed at the source in FormRenderer.vue/
-- useFormRenderer.ts (same commit) — this migration repairs rows already
-- written with the bad value.
--
-- Scope: only identities.title is repaired here. hcpForm.ts's
-- organization_id field uses the same buggy VCombobox binding, but that
-- column is a UUID FK — Postgres would have rejected a JSON-object string
-- outright rather than silently storing it, so no equivalent repair is
-- needed there. If any organization_id-related oddity turns up separately,
-- treat it as its own investigation, not an extension of this migration.
--
-- Only rows matching the exact corruption shape are touched — a title that
-- happens to legitimately start with '{' would not match this pattern.
--
-- ROLLBACK: NOT SAFE — the pre-corruption value ('Sra.', 'Dr.', etc.) is
-- exactly what this migration recovers from the embedded JSON; there is
-- no way to distinguish a repaired row from one that was always correct
-- after the fact. Rollback strategy: restore from a backup taken before
-- this migration ran, if reverting is ever needed.
--
-- Idempotent: safe to re-run — rows already repaired no longer match the
-- corruption pattern on a second pass.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format(
      $sql$
        UPDATE %I.identities
        SET title = (title::jsonb ->> 'value')
        WHERE title ~ '^\{"title":".*","value":".*"\}$'
          AND (title::jsonb ->> 'value') IS NOT NULL
      $sql$,
      r.db_schema
    );
  END LOOP;
END $$;
