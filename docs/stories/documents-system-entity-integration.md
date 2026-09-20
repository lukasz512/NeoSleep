## Refined User Story: Documents System — Entity Integration, Permissions, Signed PDFs, History & List Rebuild

**Classification**: feature
**Raw input**: Extend the Documents system (`packages/documents`, `platform.document_content_version`, `apps/api/src/{db,commands,queries,routes}/documentContent.ts`, `apps/pwa/src/views/DocumentsView.vue` / `DocumentContentEditorView.vue`) with five related pieces:
1. Documents sub-tab on entity detail views — HCP, HCO, Patient (and possibly Lead) get a "Documents" sub-tab listing the documents available/generated for that specific entity instance.
2. Document → entity-type assignment — a new tab on the document editor page (e.g. "Permissions") where an admin picks which entity types (lead/patient/hcp/hco) a document template applies to; drives what shows up in #1.
3. Per-instance signed documents — the actual generated/signed PDF per entity, downloadable, with a signed/unsigned flag. Doctor/patient e-signing on phone/tablet is explicitly future work, out of scope now.
4. History tab with real diffs — a third editor tab showing what changed between content versions, not just a flat list.
5. Rebuild the Documents list page to match the Users/Territories `AppEntityList` pattern (paginated, searchable) — needs the backend index endpoint to support paging/search.

New document *content* (Historia Clínica/endodontics intake form, STOP-Bang questionnaire, OSA consensus effects) is explicitly out of scope for this story — sequenced afterward as a separate "interactive structured forms" capture feature, decided in the same conversation this story was requested in.

### As an admin/manager, I want each document template explicitly scoped to the entity types it applies to, generated/signed instances tracked per entity with a clear signed/unsigned state, and a real diff between content versions, so that an HCP/HCO/patient's Documents tab shows exactly the right paperwork and I can trust what changed and when.

### Stakeholder Notes
- 👤 User: Today an admin/manager can edit document *content* (`DocumentContentEditorView.vue`) but there is no way to say "this document applies to HCPs, not patients" — every template in `DOCUMENT_MANIFEST` is effectively global. A rep/KAM/manager opening an HCP or patient detail page has no way to see what's been generated/signed for that person at all — `HCPDetailView.vue` and `PatientDetailView.vue` have no Documents tab (confirmed: their tab arrays are `details/notes/relatedPatients/history` and `details/notes/studies/orthoapnea/history` respectively), and `LeadDetailView.vue` has no tab system at all yet. The one precedent that exists, `UserDetailView.vue`'s Documents tab (`GET /api/v1/users/:id/documents`, `requireRole("admin","manager")`), is a small unpaged `<ul>`, not `AppEntityList` — appropriate scale to copy for #1, since a single entity will have a handful of documents, not hundreds.
- 🏢 Client: The tenant admin's compliance story depends on being able to point to "this doctor signed X, this patient signed Y, on this date" per entity — right now that's only true for the partner (doctor) registration flow (`partnerDocuments.ts`), and even there "signed" is inferred implicitly from which code path wrote the `file_attachment` row, not an explicit flag. A tenant expanding into a new market/entity type wants document templates auto-scoped to the right entity type without engineering doing it by hand each time.
- 🩺 Patient: Indirect. If patient-facing consent documents land in `DOCUMENT_MANIFEST` and get entity-type-assigned to `patient`, the same "a signed document is a point-in-time artifact, edits never retroactively change an already-generated PDF" guarantee from `docs/stories/document-content-editor.md` applies here too — the version pinning already exists (`document_content_version.version_number`/`is_current`), this story just needs to make sure the per-instance generated PDF continues to record which version it was generated from.
- 🚀 NeoCRM/Platform: High relevance, this is the reusable spine other tenants/entity types (Thailand, future entity types) will depend on. But note a real gap: `document_content_version` lives in the `platform` schema (migration `022_document_content_version.sql`), documented in its own header as "NeoSleep's own documents, not yet tenant-customizable content." Entity-type assignment (#2) is a platform-level concept (which entity types a template applies to, globally) — it is NOT the same as per-tenant customization, and this story should not silently conflate the two. Flag for `/arch` to confirm scope stays platform-level here.
- ⚖️ Compliance: Real flag on #3 specifically. `file_attachment` (`001_tenant_schema.sql:1392-1413`) has no `is_signed`/`signed_at` column, and `consent` has no such column either — "signed" is currently a side effect of which code path (`partnerDocuments.ts`) wrote the row, not a queryable, auditable state. An explicit signed/unsigned flag (plus who/when) is the kind of thing `/legal` and `/audit` will want to see modeled properly, not inferred. `/legal` input recommended before finalizing the data model for #3.

### Medical-Industry Trend Check
n/a — internal admin/CRM tooling (document management, permissions, versioning), not a clinical/PCF/HCP-engagement design question.

### Acceptance Criteria (testable)

**#1 — Documents sub-tab on entity detail views — DONE (2026-09-16)**
- [x] HCP, HCO, and Patient detail views each gain a "Documents" tab following the existing `DetailViewTabs` pattern (tabs array + `route.query.tab` sync, as in `HCPDetailView.vue`/`PatientDetailView.vue`). Built as a new shared `EntityDocumentsPanel.vue` component (lazy-loads via `DetailViewTabs`' non-eager `VWindowItem`), not copy-pasted three times.
- [ ] `LeadDetailView.vue` currently has no tab system at all — deferred, per the resolved Open Question below.
- [x] **Deviation from the original wording, decided during implementation**: the tab does NOT filter by #2's entity-type assignment. Investigation found existing signed documents (the doctor's GDPR consent + partner agreement, written by `invitePractitioner.ts`) predate `DOCUMENT_MANIFEST` entirely and don't carry a matching `templateKey` — a strict filter would have hidden them. Confirmed with Łukasz: show the real signed instances on file instead. The #2 assignment currently drives only the Permissions-tab picker, not this display filter — see the design-decision note in the approved plan (`/Users/lukasz512/.claude/plans/clever-booping-stearns.md`) for the full reasoning. Revisit once `file_attachment` gets a real signed-instance model (Slice 2/3).
- [x] **HCP-specific addition**: the practitioner Documents tab merges `file_attachment` rows for `entity_type="practitioner"` (own, currently always empty) with `entity_type="user"` for the practitioner's linked doctor account (via the ADR-014 identity link) — otherwise the one entity type with real existing data would show nothing.
- [ ] Signed/unsigned state (#3) — not shown yet, correctly deferred to Slice 2 (no `is_signed` column exists yet). Each row shows a download action today.
- [x] Role-gated consistently with how each detail view is already gated (`requireAuth`, matching `practitioner.ts`/`organization.ts`/`patient.ts`'s existing `GET /:id` routes — not hardcoded to admin/manager only).

**#2 — Document → entity-type assignment ("Permissions" tab) — DONE (2026-09-16)**
- [x] New tab added on `DocumentContentEditorView.vue` alongside "Editor", scoped per `templateKey` (not per version).
- [x] Admin/manager can select one or more of `lead`/`patient`/`practitioner`/`organization` per template (real backend entity-type names, not the `hcp`/`hco` UI shorthand — corrected during implementation, see [ADR-021](../ADR-021-document-template-entity-type-assignment.md)'s correction note); persisted via `platform.document_template_entity_type`.
- [x] This assignment currently drives only the Permissions-tab picker itself — see #1's deviation note above for why it isn't yet wired as a display filter.
- [x] `/arch assess` completed — join table `platform.document_template_entity_type`, migration `025_document_template_entity_type.sql`. See ADR-021.

**#3 — Per-instance signed documents**
- [ ] Generated PDF per entity instance is downloadable via a route mirroring `getPartnerDocumentSignedUrl` (short-lived signed URL, not a public link).
- [ ] An explicit signed/unsigned boolean (plus `signed_at`/`signed_by` where applicable) is added to the data model — not inferred from which code path wrote the row, unlike today's `partnerDocuments.ts` pattern.
- [ ] The generated PDF's `metadata` records which `document_content_version.id` it was rendered from, so edits to content never retroactively change what an already-signed document says (same guarantee as `docs/stories/document-content-editor.md`).
- [ ] Phone/tablet e-signing is explicitly NOT in scope for this story — only "downloadable PDF with signed/unsigned flag," consistent with the raw input.

**#4 — History tab with real diffs**
- [ ] Third tab on `DocumentContentEditorView.vue` (alongside Editor, Permissions) replacing/extending today's inline history `<aside>` sidebar.
- [ ] Shows an actual content diff between two `content_html` versions (word/line-level), not just the flat `change_note` list that exists today.
- [ ] No diff library exists anywhere in the monorepo today (confirmed: no `diff`/`jsondiffpatch`/`diff-match-patch` in any `package.json`) — this requires adding one. `EntityHistoryPanel.vue`'s hand-rolled top-level-key `JSON.stringify` comparator is not reusable for HTML content diffing.

**#5 — Rebuild Documents list page**
- [ ] `DocumentsView.vue`'s plain `<VTable>` is replaced with `AppEntityList`, following the same backend contract as `apps/api/src/routes/territory.ts` (`parsePaginationParams` → `{page, limit, sortBy, sortOrder}` + `search`, response `{items, total}`).
- [ ] `GET /api/v1/document-content` stops looping the full `DOCUMENT_MANIFEST` unpaged on every call and instead supports the same params — meaningful now that #2 may grow the manifest per entity type.

### Open Questions — RESOLVED (answers from Łukasz, 2026-09-16)
- [x] **Lead scope**: deferred to a follow-up. #1 ships for HCP/HCO/Patient only (existing `DetailViewTabs` pattern); `LeadDetailView.vue` gets a Documents tab later, once a tab system is worth introducing there.
- [x] **Documents tab visibility on detail views (#1)**: same visibility as the detail page itself — rep/KAM/MSL/manager who can already open an HCP/HCO/Patient's detail view see that entity's Documents tab too. This is a deliberate split from the document *editor* routes, which stay `requireRole("admin","manager")`-gated as today — viewing an entity's own documents is entity-data access, not admin config access.
- [x] **Signed/unsigned flag location (#3)**: extend `file_attachment` (`is_signed`/`signed_at`/`signed_by`) rather than `consent` — it already covers all entity types including `hco` (no CHECK-constraint widening needed), and `partnerDocuments.ts` already writes signed PDFs there today.
- [x] **#2 data model shape**: resolved by `/arch assess`, see [ADR-021](../ADR-021-document-template-entity-type-assignment.md). New join table `platform.document_template_entity_type` (`template_key`, `entity_type` CHECK IN lead/patient/practitioner/organization — real table names, not the `hcp`/`hco` UI shorthand, corrected during Slice 1 implementation planning — PK on both, mirrors `user_roles`), migration `025_document_template_entity_type.sql`, stays in `platform` schema alongside `document_content_version`.
- [ ] **Diff library choice for #4** — `diff` (line-level, lightweight) vs `jsondiffpatch`/`diff-match-patch` (word-level, heavier)? HTML content is being diffed, not plain text — needs a quick `/dev` or `/arch` spike.
- [x] **Sequencing/priority across the five sub-items** — resolved by `/product`, see below.

### Product Sequencing Decision (2026-09-16)

**Scope-creep flag first**: this is admin/manager tooling, not Stage 2's core focus (real DB reads on rep-facing CRM views per CLAUDE.md's Current Focus). It's justified as a parallel track only because #1 closes a gap already promised in `docs/stories/partner-registration-legal-documents.md` (that story's AC assumed `HCPDetailView.vue` would get a Documents tab — confirmed via code inspection that it never shipped). Treat that as the business justification for doing this now rather than after Stage 2 — not a blank check to also do #4/#5 on the same timeline.

**Slice 1 (MVP — ship first, one PR)**: #2 (entity-type assignment / "Permissions" tab) + #1 (Documents tab on HCP/HCO/Patient, Lead deferred). #2 is a hard prerequisite for #1 and both are small in scope, so split them into two PRs only if `/arch`'s data-model choice for #2 turns out to be bigger than expected. This slice is the one with real day-to-day value: reps/KAMs/managers finally see what's been generated/signed for the entity they're looking at, and it fulfills the earlier story's unmet AC.

**Slice 2 (ship next)**: #3 (signed/unsigned tracking on `file_attachment` + download route). Builds directly on Slice 1's UI (the signed/unsigned badge has nowhere to render without #1 first) and carries real compliance value — worth prioritizing over #4/#5.

**Slice 3 (defer, low priority, standalone whenever convenient)**: #5 (list rebuild to `AppEntityList`). Independent, no dependencies, but pure internal-tooling polish (pagination only matters once the manifest is large) — do it as a small isolated PR whenever there's a gap, not on the critical path of this story.

**Slice 4 (defer out of this round entirely)**: #4 (History tab with real diffs). Requires a new dependency (no diff library exists in the repo today), touches only the admin content editor with zero rep-facing value, and nothing else depends on it. Recommend revisiting after Slices 1–2 ship and Stage 2 core CRM work has more runway — don't let it ride along just because it was scoped in the same story.

### Hand-off
→ **Slice 1 shipped (2026-09-16)** — #2 + #1 implemented and tested, including new coverage for `HCPDetailView.vue`/`HCODetailView.vue`/`PatientDetailView.vue` themselves (previously untested views, verifying the Documents tab renders and wires to the right endpoint per entity) added after Łukasz flagged the gap. Backend: 279/279 `apps/api` tests passing, real Postgres. Frontend: 252/252 `apps/pwa` tests passing. Lint/typecheck clean on both apps. Still not covered: `getPartnerDocumentSignedUrl`'s real success path (only its ownership-guard rejections are tested) and manual/browser verification. Not yet committed/PR'd.
→ `/arch assess` — NEXT STEP, owed before Slice 2: `file_attachment` signed-flag columns (`is_signed`/`signed_at`/`signed_by`)
→ `/legal` — signed/unsigned document state requirements, ideally before Slice 2's data model is finalized
→ Build order: ~~Slice 1 (#2+#1)~~ done → Slice 2 (#3) → Slice 3 (#5, standalone) → Slice 4 (#4, deferred out of this round)
