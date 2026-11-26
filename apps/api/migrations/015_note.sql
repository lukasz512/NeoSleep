-- =============================================================================
-- Migration 015: note table — generic multi-author annotations
--
-- Adds a `note` table used across patient, practitioner, organization, and
-- lead: entity_type/entity_id + author_id + body, one row per note, append-
-- only (soft-delete via deleted_at). Distinct from `identities.notes`, which
-- is a single overwritable field and can't hold multiple authors over time.
-- Mirrors `file_attachment`'s entity_type/entity_id shape exactly (see
-- 003_practitioner_drop_duplicate_salutation.sql's FILE ATTACHMENTS block).
--
-- Same known gap as 004/005/014 (documented there, repeated here rather than
-- re-litigated): this only patches already-provisioned tenant schemas
-- (neosleep, fourseasons) via the DO $$ loop below. create_tenant_schema()
-- is not edited — no new tenant is being provisioned right now, and hand-
-- editing that ~1900-line function risks transcription errors for no
-- immediate benefit. Fold this table into create_tenant_schema() the next
-- time that function is touched for an unrelated reason.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: note table must have 0 rows (or an explicit decision to
--   discard existing notes — they are not recoverable after DROP TABLE).
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('DROP TABLE IF EXISTS %I.note', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.note (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type TEXT        NOT NULL,   -- ''patient'' | ''practitioner'' | ''organization'' | ''lead''
        entity_id   UUID        NOT NULL,
        author_id   UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        body        TEXT        NOT NULL,
        metadata    JSONB,
        deleted_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.note (entity_type, entity_id)',
      r.db_schema||'_note_entity_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.note (author_id)',
      r.db_schema||'_note_author_idx', r.db_schema);
  END LOOP;
END $$;
