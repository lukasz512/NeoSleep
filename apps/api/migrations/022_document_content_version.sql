-- =============================================================================
-- Migration 022: platform.document_content_version
--
-- Backs the admin/manager "Documents" content editor (see
-- docs/stories/document-content-editor.md). NeoSleep's own generated
-- legal/clinical documents (patient informed consent, doctor GDPR consent
-- PL/MX, more to come) currently have their body prose baked into
-- packages/i18n/*.json + packages/documents/templates/*.html, only
-- changeable via a code commit + deploy. This table makes that prose
-- editable at runtime while keeping every past version intact — a signed
-- PDF must always stay traceable to the exact wording that was current when
-- it was generated, never retroactively altered by a later content edit.
--
-- platform schema, not per-tenant: these are NeoSleep's own documents in its
-- relationship with doctors/patients, not a given tenant's customizable
-- content (tenant-customizable wording is a documented future aspiration,
-- not current scope) — same category as platform.dpa_agreement just above,
-- which is the direct precedent for the is_current/version-row pattern used
-- here. One deliberate improvement over that precedent: dpa_agreement's own
-- idx_platform_dpa_current index is NOT actually UNIQUE despite its comment
-- claiming "exactly one true at a time" — that invariant is only
-- application-enforced there. This feature's PDF-traceability guarantee
-- depends on "current" being unambiguous, so it's a real UNIQUE partial
-- index here, not just transaction discipline.
--
-- template_key is a free string (not a CHECK-constrained enum) so a new
-- document type can be added later (new template file + a
-- packages/documents/src/documentManifest.ts entry) with zero migration.
-- locale is validated in the command layer against @neo/documents' known
-- locales, same reasoning.
--
-- created_by_* is denormalized (name/email/tenant snapshot at save time),
-- not a FK to a users row: users live in a per-tenant schema, platform
-- does not — same reason dpa_agreement.signed_by is plain TEXT, not a FK.
-- This also means the audit trail survives a later tenant-user deletion.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: none — a standalone new table with no dependents yet
-- (file_attachment.metadata->>'content_version_id' is an unenforced JSONB
-- pointer, not a real FK, so nothing breaks if this table disappears).
--   DROP TABLE IF EXISTS platform.document_content_version;
-- End of rollback block
--
-- Idempotent: safe to re-run (IF NOT EXISTS throughout).
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.document_content_version (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key           TEXT        NOT NULL,
  locale                 TEXT        NOT NULL,
  content_html           TEXT        NOT NULL,
  version_number         INTEGER     NOT NULL,
  is_current             BOOLEAN     NOT NULL DEFAULT true,
  created_by_user_id     UUID        NOT NULL,
  created_by_name        TEXT        NOT NULL,
  created_by_email       TEXT        NOT NULL,
  created_by_tenant_slug TEXT        NOT NULL,
  change_note            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_document_content_version_current
  ON platform.document_content_version (template_key, locale) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_platform_document_content_version_history
  ON platform.document_content_version (template_key, locale, version_number);
