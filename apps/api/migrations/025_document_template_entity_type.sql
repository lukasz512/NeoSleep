-- =============================================================================
-- Migration 025: platform.document_template_entity_type
--
-- Backs the "Permissions" tab on the document content editor (see
-- docs/stories/documents-system-entity-integration.md, ADR-021). Lets an
-- admin/manager assign which entity types (lead/patient/practitioner/
-- organization) a document template applies to — this in turn drives what
-- shows up on each entity's own "Documents" sub-tab.
--
-- entity_type values are the real backend table names, not the "hcp"/"hco"
-- UI shorthand, to stay consistent with every other entity_type column in
-- this schema (consent.entity_type, note's NOTE_ENTITY_TYPES). "hcp"/"hco"
-- only exist as a cosmetic UI vocabulary (e.g. AppAvatar entity-type="hco").
--
-- platform schema, not per-tenant: same reasoning as
-- platform.document_content_version (022_document_content_version.sql) —
-- entity-type assignment is a template-level property, and templates
-- aren't tenant-customizable yet.
--
-- template_key has no FK, matching document_content_version.template_key:
-- it's an unconstrained free string validated at the command layer against
-- @neo/documents' DOCUMENT_MANIFEST, not the DB layer, so a new document
-- type can be added with zero migration.
--
-- Join table (one row per template_key + entity_type pair), not an array
-- column — mirrors the existing user_roles table shape (user_id + role).
-- Current-state config, not a legal record: assigning/unassigning is a
-- plain insert/delete, with an audit_log write on each change at the
-- command layer (no versioning needed on this table itself).
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: none — a standalone new table with no dependents.
--   DROP TABLE IF EXISTS platform.document_template_entity_type;
-- End of rollback block
--
-- Idempotent: safe to re-run (IF NOT EXISTS throughout).
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.document_template_entity_type (
  template_key       TEXT        NOT NULL,
  entity_type        TEXT        NOT NULL CHECK (entity_type IN ('lead', 'patient', 'practitioner', 'organization')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID        NOT NULL,
  PRIMARY KEY (template_key, entity_type)
);
