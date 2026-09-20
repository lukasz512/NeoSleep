# ADR-022: Historia Endo intake + STOP-Bang screening schema

## Status
Accepted

## Context

`docs/stories/historia-endo-clinical-intake-and-printable-pdf.md` scopes a
new feature: a partner dentist (Lorena González) wants the patient
medical-history section and the dentist's oral-exam findings captured as
yes/no taps instead of free text, plus a printable PDF pre-filled with
whatever patient/doctor/clinic data NeoSleep's system already has. Łukasz
separately decided STOP-Bang (an 8-item OSA screening questionnaire) rides
in the same story, and confirmed the dental intake is one record per
patient, updated in place — not per visit or per tooth.

No existing table fits. `encounter` (the platform's "visit" table) models
the rep's visit to the HCP (`user_id` = rep, `NOT NULL`, no `patient_id`
column) — the wrong relationship entirely for a patient's clinical intake.
`sleep_study` is the correct structural precedent: a dedicated table keyed
on `patient_id`, typed clinical columns, a doctor-attribution FK, no
identity extension.

## Decision

Two new tenant-schema tables, migration `026_endo_intake.sql`:

**`endo_intake`** — one row per patient (`patient_id UUID UNIQUE`), typed
`BOOLEAN` columns for each hardcoded checklist item (patient antecedentes
médicos + dentist oral-exam findings), `recorded_by` FK to `users` — not
`practitioner` (corrected during implementation: the acting party is
always the logged-in staff user, `TenantContext.user.id`, which is a
`users.id`; a doctor-role staff user has both a `users` row and a linked
`practitioner` row per ADR-014, but it's the `users` row this command
actually holds) — standard `metadata`/timestamps/`deleted_at`. Upsert
semantics (`INSERT ... ON CONFLICT (patient_id) DO UPDATE`) — re-intake
overwrites in place, per Łukasz's explicit "one per patient, add more later
if needed" call.

**`stop_bang_screening`** — its own table, **not** embedded on
`endo_intake` and **not** added to `sleep_study`. STOP-Bang is a
standardized, *recurring* screening instrument (re-administered as
symptoms/weight change) — forcing it onto `endo_intake`'s one-row-per-patient
shape would silently discard every prior score on re-screening.
`sleep_study` was rejected as the host because its `status` column is a
device-study state machine (`ordered` → `interpreted`), a different
lifecycle than a subjective questionnaire captured at chairside intake,
before any device study is ordered. Multiple rows per `patient_id`, `score`
as a `GENERATED ALWAYS ... STORED` column (computed server-side, not
app-logic-duplicated).

`stop_bang_screening.pressure` is its own captured boolean, deliberately
**not** derived from `endo_intake.has_hypertension` even though they're the
same clinical fact — STOP-Bang is a validated instrument whose items must
be asked and stored as asked, not silently substituted via a cross-table
join that breaks quietly if either table's meaning drifts later.

Typed `BOOLEAN` columns (not a `responses JSONB` blob) throughout, matching
`sleep_study`'s own established style — the question list is hardcoded for
v1 (Łukasz's own call, no config-driven reason to prefer JSONB), and typed
columns keep reporting queries (`WHERE has_diabetes`) plain SQL instead of
`JSONB ->>` lookups needing a GIN index.

Both tables loop over `platform.tenants` using `EXECUTE format(...)` per
`021_sleep_study_type.sql`'s established pattern for adding a table to
already-provisioned tenant schemas after `create_tenant_schema()` was first
defined — a plain unqualified `CREATE TABLE` would only hit whatever schema
the migration runner's connection defaults to, not any real tenant schema.

**PDF generation** reuses existing, previously-unused-in-production
infrastructure: `apps/api/src/services/documentRenderer.ts`'s
`renderHtmlToPdf` (confirmed via repo-wide grep — nothing calls it today)
becomes its first real caller, alongside `packages/documents`' `{{token}}`
+ `data-field` template mechanism already proven by `informedConsent.html`.
The informed-consent text block is a new `DOCUMENT_MANIFEST` entry through
the existing `document_content_version` pipeline (versioned, admin-editable),
not hardcoded into a static file. The generated PDF's `file_attachment` row
(`entity_type="patient"`) is picked up automatically by the patient
Documents tab shipped in
`docs/stories/documents-system-entity-integration.md` (Slice 1) — no
frontend work needed for it to appear there.

## Consequences

- Adding a real per-tooth/per-treatment Historia Endo later is additive (a
  second table or a `tooth` field), not a rework of this one — accepted
  trade-off per Łukasz.
- `documentRenderer.ts`'s design assumptions get validated end-to-end for
  the first time by this feature, not just by documentation.
- Neither table maps to an existing row in CLAUDE.md's FHIR table. The
  correct eventual FHIR resource for both is `QuestionnaireResponse` (a
  structured question/answer set tied to a subject), not `Observation` per
  finding — flagged for a future FHIR Phase 2 pass (ADR-009), not built now.
  No door is closed: typed boolean columns can be re-projected into a
  `QuestionnaireResponse.item[]` shape later via a read-side transform, no
  data migration needed.
- A future tenant needing a different question set requires a new
  migration (hardcoded v1) — accepted, revisit if/when a second tenant asks.

## Compliance Impact

Both tables hold GDPR Art. 9 special-category health data — same posture as
`patient.diagnosis_code`/`medical_record` already gets. `audit_log` write
required on every save (who recorded what, when). `/legal` review
recommended on retention and the informed-consent text before go-live.
