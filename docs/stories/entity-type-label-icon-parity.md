## Refined User Story: Specialty/type label+icon parity across list, detail, and edit views

**Classification**: feature
**Raw input** (NEO-19 follow-up comment, Łukasz, 2026-09-20, translated from Polish): "I see it on the HCP list view, but not on edit anymore — edit still has no icons. Also, every specialty — on the edit and detail view of every entity — should show as a label with a specialty icon. Fix the whole PWA."

### As a rep or FFM using the PWA, I want to see an entity's specialty/type as the same icon+label chip everywhere I encounter it (list card, detail view, edit form), so the app feels consistent instead of icons appearing only on the mobile list card NEO-19 just shipped.

### Stakeholder Notes
- 👤 User: NEO-19 added a specialty icon+chip only to the HCP mobile list card. The same information (HCP specialty, HCO type) is shown as plain text/plain chip elsewhere — `HCPDetailView.vue` (plain text), `HCODetailView.vue` (`VChip` with no icon), and both entities' edit forms (`FormRenderer` select dropdowns with no icon). That inconsistency is what triggered this follow-up.
- 🏢 Client: Low-risk polish request, not new capability — visual consistency a tenant would expect once they've seen the pattern once, not something that changes what data is captured or how the client's reps work.
- 🩺 Patient: No downstream effect — still a display-only change on already-authorized, already-fetched data.
- 🚀 NeoCRM/Platform: `platform` — the underlying mechanism (`FormRenderer`'s existing `avatarEntityType`/color-pill item-rendering pattern) is shared, tenant-agnostic infrastructure. Extending it to support an icon-per-option resolver benefits every white-label tenant's forms, not just the current one.
- ⚖️ Compliance: No early flags — same reasoning as NEO-19 (display-only, no new data exposed).

### Medical-Industry Trend Check
n/a — internal UI consistency fix, not a clinical workflow or PCF/eDetail change.

### Scope confirmed via codebase investigation
- `HCPDetailView.vue:146-147` shows `specialty` as plain `<dd>` text, no chip, no icon.
- `HCPView`'s edit form (`apps/pwa/src/config/forms/hcpForm.ts:286-289`) renders `primary_specialty` as a plain `FormRenderer` `type: "select"` field — no icon.
- `HCODetailView.vue:43-44` already shows `type` as a `VChip` (color-coded via `hcoTypeColor`/`hcoTypeLabel`) but with no icon, even though `hcoTypeIcon()` already exists (`hcoLabels.ts`) and is used elsewhere (avatars).
- `HCOView`'s edit form (`apps/pwa/src/config/forms/hcoForm.ts:67`) renders `type` as a plain `FormRenderer` select — no icon.
- `FormRenderer.vue` already has two precedents for custom select-item rendering via slot overrides keyed off a field flag: `avatarEntityType` (renders an avatar per item) and `hasColorOptions` (renders a colored pill per item, `FormRenderer.vue:343`). Adding icon-per-option rendering is a natural third case in the same pattern, not a new architecture — likely a shared `iconResolver` field option consumed by both `hcpForm.ts` and `hcoForm.ts`.
- Only two entities currently have both (a) a categorical field like this and (b) an existing icon-mapping util: HCP (`practitionerSpecialtyIcon`, just added in NEO-19) and HCO (`hcoTypeIcon`, pre-existing). No other entity list view (Leads, Territories, Treatment Plans, Sleep Studies) has an analogous "specialty" concept — their `type`/`status` fields are already shown as chips without an icon convention having been requested for them, before or after NEO-19.

### Acceptance Criteria
- [ ] `HCPDetailView.vue`: specialty renders as a labeled chip with the same icon (`practitionerSpecialtyIcon`) used on the mobile list card, not plain text.
- [ ] HCP edit form (`hcpForm.ts` → `FormRenderer`): the `primary_specialty` select shows the matching specialty icon next to each option (and the selected value), not a plain dropdown.
- [ ] `HCODetailView.vue`: the existing `type` `VChip` gains the matching `hcoTypeIcon` on its left, without changing its current color-coding.
- [ ] HCO edit form (`hcoForm.ts` → `FormRenderer`): the `type` select shows the matching org-type icon next to each option (and the selected value).
- [ ] `FormRenderer.vue`'s new icon-rendering capability is a generic, reusable field option (not hardcoded to HCP/HCO specifically), consistent with how `avatarEntityType`/color-pill support already work — any future white-label tenant field with an icon map can opt in the same way.
- [ ] No new or modified backend route/query — all icon mapping stays frontend-only, same as NEO-19.
- [ ] No hardcoded user-facing strings; existing i18n labels are reused as-is (no new translatable text expected — icons are additive, not replacing labels).

### Open Questions
- [ ] **Scope of "every entity"** — Łukasz's comment says "kazdego entity" (every entity). Codebase investigation found only HCP (specialty) and HCO (type) currently have both a categorical field and an existing icon map. Does "every entity" mean: (a) just these two — the ones that already have the underlying icon vocabulary — or (b) something broader, e.g. giving Leads/Treatment Plans/Sleep Studies' `type`/`status` fields new icon maps too, which would be new UI vocabulary, not just applying an existing one more consistently? Defaulting to (a) as the confident, in-scope interpretation; (b) would need its own icon-mapping decisions per entity and is a materially bigger ask.
- [ ] Does the specialty/type icon also belong on the **desktop table** columns for HCP/HCO (not just detail + edit + mobile card), or is desktop-table scope intentionally left alone, same as NEO-19's AC that desktop stayed unchanged? Defaulting to "leave desktop table as-is" (icons in the mobile card, detail chip, and edit-form dropdown only) unless told otherwise, since NEO-19 explicitly kept the desktop table untouched by design.

### Hand-off
→ `/arch assess form-renderer-icon-options` — touches a shared, cross-cutting component (`FormRenderer.vue`)'s item-rendering pattern, which is exactly the kind of "more than one reasonable UI pattern" / shared-infrastructure decision that benefits from an explicit architecture pass rather than an ad hoc per-view implementation, especially since it should generalize the same way `avatarEntityType`/color-pill options already do.
