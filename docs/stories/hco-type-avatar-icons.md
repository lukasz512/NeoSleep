## Refined User Story: HCO type-specific avatar icons

**Classification**: feature
**Raw input**: NEO-18 "pwa clinic" (translated from Polish) — "Icons for this: clinic gets the icon it has now; hospital — bigger building; pharmacy — pill split in 2; private — doctor icon (a person must be there, but different from the patient icon); other — propose something, some building but different. These are icons that will be visible in avatars for places [organizations]." Two reference screenshots were attached showing where the HCO avatar renders (list row and detail header context).

### As a rep or KAM, I want to visually tell HCO (organization) types apart in the app by their avatar icon so that I can scan a list of clinics/hospitals/pharmacies/practices and recognize the place type at a glance, without reading the type label text.

### Stakeholder Notes
- 👤 User: Reps and KAMs work across many HCOs per territory; today every HCO (clinic, hospital, pharmacy, practice, other) renders the identical `nav-hco` icon in `AppAvatar.vue`, so the avatar carries no type signal — the user must read the text label instead. A distinct icon per type speeds up visual scanning in list views.
- 🏢 Client: Purely cosmetic/UX polish for the tenant's own field force; no tenant-configurable behavior, no reporting impact. Low direct ROI but low cost, improves perceived product polish for a white-label buyer evaluating the app.
- 🩺 Patient: No downstream patient effect — this only changes how an HCO record is visually represented in the rep-facing UI, not any clinical or PCF data.
- 🚀 NeoCRM/Platform: Icon set is tenant-agnostic (organization `type` is a shared enum, not tenant-specific), so this generalizes automatically to every current and future white-label tenant — no one-off risk.
- ⚖️ Compliance: No early flags — no new data collected, no new field, purely a rendering change keyed off an enum value that already exists and is already sent to the frontend.

### Medical-Industry Trend Check
n/a — internal UI/icon change, not a clinical workflow or HCP-engagement pattern.

### Open Questions
- [x] Resolved: the ticket's "private" label has no matching value in the `organization.type` CHECK constraint (`clinic`, `hospital`, `pharmacy`, `practice`, `other` — `apps/api/migrations/001_tenant_schema.sql`). Treating "private" as the existing `practice` DB value ("private practice"), since that's the only enum value left unaddressed by the other four instructions and matches the Polish wording's intent (a private practice run by one professional, hence "a person must be there").
- [x] Resolved: exact icon glyph designs aren't specified beyond the description (hospital = bigger building, pharmacy = pill split in two, practice = doctor/person distinct from patient, other = a different building shape). Implementer proposes concrete 24x24 stroke-based SVG paths consistent with the existing `AppIcon.vue` style (matches ticket's own "propose something" instruction for the `other` icon).
- [ ] None blocking — proceeding with the mapping above.

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] `AppAvatar.vue` renders a distinct icon per `organization.type` value when used with `entity-type="hco"` and no photo/initials are available: `clinic` → unchanged existing `nav-hco` icon; `hospital` → new larger-building icon; `pharmacy` → new split-pill icon; `practice` → new doctor/person icon, visually distinct from the existing `nav-patients` icon; `other` → new distinct building icon.
- [ ] Any HCO avatar with an unrecognized/null `type` value falls back to the existing `nav-hco` icon (no crash, no blank icon).
- [ ] The new icon-selection logic is covered by a component/unit test in the existing `@neo/pwa` or `@neo/ui` test suite (whichever package `AppAvatar.vue`/`AppIcon.vue` test files already live under).
- [ ] No i18n string changes required (icons only, no new label text) — existing `hcoTypeLabel()` keys are untouched.
- [ ] No backend, DB, or migration changes — `organization.type` already exists and is already returned to the frontend.

### Hand-off
→ `/dev feat hco-type-avatar-icons` — scope is clear, small, self-contained (frontend-only icon/avatar change), no schema or cross-cutting architecture impact.
