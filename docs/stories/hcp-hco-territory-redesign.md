## Refined User Story: HCP/HCO View Redesign + Territory Rollout

**Classification**: feature — extends the Territory data model (previously Patient-detail-only) to HCP and HCO across list/detail/forms, adds new tabs (Notes, Related Patients/Doctors, History) backed by new API filters and queries, and restyles both entity's list/detail views (labels, icons, avatars, layout).

**Raw input**: Łukasz's direct request — a batch list of UI fixes across HCP/HCO list and detail views ("especialidad powinna byc labelem", "institution powinno nazywac sie clinica", icons/avatars, new tabs), plus an explicit architectural note: "region to legacy, chcialbym sie upewnic ze territory bedzie dzialalo globally. potem bedziemy to wykorzystywac do matchowania hcp i patient. to bedzie wazne." ("region is legacy, I want to make sure territory works globally — we'll use it later to match HCP and patient, that will be important.")

### As a rep/manager/admin, I want HCP and HCO records to carry the same structured Territory assignment Patients already have (not just the legacy free-text region), and to see HCP/HCO in a consistent, readable format (proper labels, clinic/doctor cross-links, notes, related-records, and history), so that the platform can later match HCPs to patients by territory and so day-to-day browsing of doctors/clinics is not showing raw codes or dead-end text.

### Stakeholder Notes
- User (rep/manager): Sees translated labels instead of raw specialty/type codes, a real clickable link from a doctor to their clinic (and back, via Related Doctors), and can now leave notes and see change history on HCP/HCO the same way they already can for patients.
- Client/Tenant: Territory is the structural key the platform will use for HCP↔patient matching — extending it now (rather than leaving it patient-only) avoids a second, inconsistent retrofit later once matching logic is built on top of it.
- Patient: No direct UI change, but future territory-based HCP-matching depends on HCP/HCO actually carrying `territory_id` — this story makes that field assignable and displayed; it does not itself implement matching.
- NeoCRM/Platform: Reused existing, already-generic primitives instead of duplicating per-entity — `note` (entity_type/entity_id) and `PatientNotesPanel.vue` were already built generic and unused outside Patient; `EntityLink.vue` centralizes the avatar-on-identity-link pattern; `EntityHistoryPanel.vue` generalizes the former patient-only history panel. `AUDIT_FIELD_ALLOWLIST` (compliance-sensitive: which audit_log fields are exposed to non-admin roles) was extended deliberately per-entity, not opened up broadly.
- Compliance: History tab additions for Practitioner/Organization go through the same redaction allow-list pattern as Patient's — no new field exposure beyond what was explicitly added (`id`, `primary_specialty`, `region`, `status` for Practitioner; `id`, `name`, `type`, `status`, `region` for Organization).

### Acceptance Criteria
- [x] HCP list: specialty renders as a translated label; Institution/Clínica column links to the HCO detail page with an icon; Region column shows resolved Territory (falls back to legacy region text when unassigned).
- [x] HCP detail: same specialty/clínica treatment; tabs (Details, Notes, Related Patients, History) via `DetailViewTabs`; Related Patients backed by a new `practitioner_id` filter on `GET /api/v1/patient`.
- [x] HCO list: avatar shows the clinic icon (not initials — orgs aren't people); Tipo renders as a translated label and is the last column; Región/Territory column; Estado removed from the list.
- [x] HCO detail: Tipo as label; Territory row; tabs (Details, Notes, Related Doctors, History); contact fields (phone/email/website/Google Maps link) as icon-only rows; address + an embedded single-pin map on the right column at desktop width (reusing `apps/web`'s existing Google Maps JS integration, ported into `apps/pwa`).
- [x] `territory_id` is a real, assignable field end-to-end (DB → command → route → form) for both Practitioner and Organization, mirroring Patient's existing pattern exactly (including keeping the legacy `region` field alongside it, not replacing it).
- [x] History tab generalized (`EntityHistoryPanel.vue`) and now shows old→new values per changed field, not just field names — reused by Patient/HCP/HCO alike.
- [x] All touched packages typecheck/lint clean; full `apps/api` suite green (202/202) against the real dev DB; `apps/pwa` suite green except the pre-existing, unrelated `AppLayout.spec.ts` brittle-test debt (already tracked separately).

### Open Questions
- [ ] Backfilling real `territory_id` values onto existing HCP/HCO/Patient/Lead records — explicitly out of scope here (no reliable automated mapping from today's free-text `region` values to the still-shallow 2-level territory hierarchy). Needed before territory-based matching is actually useful in practice.
- [ ] Lead entity was not touched (list/detail/forms still region-only) — user's request only named HCP/HCO; revisit if Lead needs the same rollout before matching logic depends on it.
- [ ] Full browser/visual verification (screenshots) was not completed this session — no authenticated headless-browser session was available quickly (no cached login credential, `chromium-cli` unavailable). Verified instead via: typecheck+lint clean across all touched files, full `apps/api` test suite green against live DB, and a direct one-off script exercising every new/changed query against real data (no SQL errors, correct shapes returned). Recommend an actual in-browser pass before shipping.

### Hand-off
-> Visual QA pass in a browser (desktop + mobile width) before merge; then `/arch` review if Territory backfill/matching design is scoped as a follow-up.
