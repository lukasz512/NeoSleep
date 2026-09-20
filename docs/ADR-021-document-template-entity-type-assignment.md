# ADR-021: Document template → entity-type assignment schema

## Status
Accepted

## Context

`docs/stories/documents-system-entity-integration.md` (Slice 1) adds two
related pieces to the Documents system: an admin-facing "Permissions" tab on
the document content editor where an admin picks which entity types
(`lead`/`patient`/`hcp`/`hco`) a document template applies to, and a
"Documents" sub-tab on HCP/HCO/Patient detail views that reads that
assignment to decide what to list (`lead` is deferred to a follow-up story —
`LeadDetailView.vue` has no tab system yet).

No DB-side representation of "a document template" exists today.
`platform.document_content_version` (migration `022_document_content_version.sql`)
stores versioned *content*, not a template row — `template_key` is a free
string validated at the command layer against `DOCUMENT_MANIFEST`
(`packages/documents/src/documentManifest.ts`), which is deliberately
DB-free/static so a new document type can be added with zero migration
(currently 3 real templates + 1 hidden test fixture). Entity-type assignment
is a template-level property (doesn't vary per version or locale), so it
can't correctly live on `document_content_version` rows either.

## Decision

New table, `platform.document_template_entity_type`:

```sql
CREATE TABLE IF NOT EXISTS platform.document_template_entity_type (
  template_key TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL CHECK (entity_type IN ('lead', 'patient', 'practitioner', 'organization')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID  NOT NULL,
  PRIMARY KEY (template_key, entity_type)
);
```

**Correction (2026-09-16, during Slice 1 implementation planning)**: the
`entity_type` values are `practitioner`/`organization`, not the UI-shorthand
`hcp`/`hco` originally written here. `hcp`/`hco` only exist as a cosmetic
UI vocabulary (e.g. `AppAvatar entity-type="hco"`); every real backend
`entity_type` column (`consent.entity_type`, `note`'s `NOTE_ENTITY_TYPES`,
`file_attachment` rows) uses the actual table name. Fixed here before the
migration shipped — no rows existed yet, so no data migration was needed.

Migration file: `025_document_template_entity_type.sql` (the next free
number — `022` already has three colliding filenames, tolerated because the
migration runner, `apps/api/src/db/migrations.ts`, sorts and tracks by exact
filename rather than parsing the numeric prefix; `023` and `024` are already
taken).

**Shape — join table, not an array column.** Mirrors the existing
`user_roles` table (`user_id` + `role`) rather than a single
`document_entity_type_assignment(template_key PK, entity_types TEXT[])`
row-per-template alternative. A join table keeps the door open for
per-assignment metadata later (e.g. a `required` flag) without unpacking an
array column, and matches an established in-repo pattern instead of
introducing a new one. Expected cardinality is tiny (≲ dozens of templates ×
4 entity types), so no secondary index on `entity_type` alone is added now —
a full scan of this table is trivial at that scale; revisit only if that
assumption changes.

`template_key` has no FK — consistent with `document_content_version.template_key`,
which is intentionally an unconstrained free string validated against
`DOCUMENT_MANIFEST` at the command layer, not the DB layer.

**Scope — stays in `platform` schema**, consistent with
`document_content_version`. That table's own header comment is explicit:
these are NeoSleep's own documents, not yet tenant-customizable content
("a documented future aspiration, not current scope"). Entity-type
assignment is the same kind of template-level metadata, not a per-tenant
concern, so it follows the same scope. This does not close the door on a
future per-tenant override: `platform.lookups` + `{tenant}.lookup` is
already the established two-layer pattern (global-locked + per-tenant
override) this could follow later if/when template *content*
customization becomes real and assignment needs to be overridable too. Not
building that layer now — YAGNI until the content-customization aspiration
itself lands.

**Mutability**: this table holds current-state config, not a legal record —
unlike `document_content_version` (append-only, `is_current` flag) or
`consent` (never deleted). Assigning/unassigning an entity type is a
straightforward insert/delete of the relevant row, with an `audit_log` write
on each change (same best-effort pattern already used by
`SaveDocumentContentVersionCommand`). If compliance later wants a full
history of assignment changes, `audit_log` already covers it as long as
every write path goes through it — no versioning needed on this table
itself.

## Consequences

- The entity Documents tab (Slice 1, item #1) queries this table by
  `entity_type` (small table scan) to get the set of assigned
  `template_key`s, then reads current content/generated instances per the
  existing `document_content_version` and (Slice 2) `file_attachment` paths.
- Adding a document type still requires zero migration
  (`DOCUMENT_MANIFEST` + template file); assigning it to entity types is a
  data change via the new Permissions tab, also migration-free.
- If tenant-customizable document templates land later (the documented
  future aspiration), this table's platform-only scope will need revisiting
  alongside `document_content_version`'s — not a new problem this ADR
  introduces, the same open door already existed.

## Compliance Impact

None beyond what already applies to the Documents system. This table stores
no personal data — only template keys and entity-type category labels.
Audit trail for assignment changes goes through the existing `audit_log`
table, same as document content edits.
