## Refined User Story: PWA mobile card data parity for entity lists

**Classification**: feature
**Raw input** (NEO-19, "pwa medico", translated from Polish): "On mobile, all the data that's visible on desktop should also be shown [for the practitioner/'medico' list]. Clinic (but not linked here) and territory. Dentist should be a label/chip, and these [specialty] types should get icons on the left — dentist gets a tooth icon, match the rest to their description. Then check the other lists: they should have the same data as shown in the desktop tables. Arrange it nicely on cards, readable and modern."

### As a rep or FFM using the PWA on a phone, I want to see the same key fields on a practitioner (and other entity) card that I already see in the desktop table, so that I don't lose information just because I'm on mobile.

### Stakeholder Notes
- 👤 User: Reps and FFMs work the PWA mostly on mobile in the field. Missing institution/territory/specialty on the mobile HCP card today means they have to guess or switch to desktop to confirm which clinic and territory a practitioner belongs to before a visit.
- 🏢 Client: A tenant's field force is mobile-first by design (CLAUDE.md: "mobile-first"). Desktop/mobile data parity is a baseline UX expectation the client already paid for, not new scope.
- 🩺 Patient: No downstream effect — this only changes how already-fetched, already-permitted data is displayed, not what's collected or who can access it.
- 🚀 NeoCRM/Platform: Directly reusable across all white-label tenants — `AppEntityList` is shared, tenant-agnostic infrastructure; fixing the pattern here benefits every tenant's mobile experience, not just the current one.
- ⚖️ Compliance: No early flags — purely a display/rendering change on data the practitioner list endpoint already returns to an authenticated, already-authorized user. No new data exposed, no new endpoint, no schema change.

### Medical-Industry Trend Check
n/a — internal UI consistency fix, not a change to PCF/eDetail design, HCP engagement pattern, or clinical workflow.

### Scope confirmed via codebase investigation
- `GET /api/v1/practitioner` (`apps/api/src/queries/practitioner.ts`) already returns `institution`, `region`/`territory_name`, and `specialty` on the list endpoint — **no backend/query change needed**, per CLAUDE.md's architecture rule that all trust-boundary logic stays in `apps/api/`.
- `apps/pwa/src/components/AppEntityList.vue` already renders both the desktop `VDataTableServer` and the mobile card feed from the same fetched `items`, via named slots (`feed-card-avatar`, `feed-card-title`, `feed-card-meta`, `feed-card-status`, `feed-card-actions`) — the fix is filling in more of those slots per view, not new data fetching.
- Table-vs-card gaps confirmed to exist (same pattern, same fix, no backend change) in: `HCPView.vue` (institution, territory, specialty chip+icon — the ticket's primary ask), `LeadsView.vue` (institution icon), `TerritoriesView.vue` (code, country_code), `TreatmentPlansView.vue` (type, dentist_name). `SleepStudiesView.vue` has a larger gap (study_type, study_date, ahi_score, interpreted_by_name) but is in scope as explicitly called out by "check the other lists." `HCOView.vue`, `UsersView.vue`, `PatientsView.vue` already show their key desktop columns on mobile — out of scope (nothing to fix).
- Specialty icon mapping follows the existing `hcoTypeIcon` pattern (`apps/pwa/src/utils/hcoLabels.ts`) — a plain type-string → icon/label map, no backend involvement. A new "tooth" SVG needs adding to `AppIcon.vue`'s registry for the dentist case; other specialty codes get the closest existing/reasonable icon.

### Acceptance Criteria
- [ ] On mobile (card view), the HCP/practitioner list shows: institution/clinic name as plain text (not a clickable link, unlike the desktop table), territory name, and specialty as a labeled chip.
- [ ] The specialty chip has an icon on its left matching the specialty; dentist specifically uses a tooth icon.
- [ ] Desktop table view for practitioners is unchanged (still links institution).
- [ ] `LeadsView.vue`, `TerritoriesView.vue`, `TreatmentPlansView.vue`, and `SleepStudiesView.vue` mobile cards show the same columns their desktop tables already show (per the gaps listed above).
- [ ] No new or modified backend route/query — all data comes from already-existing API responses.
- [ ] Mobile cards remain visually consistent with the rest of the app's card style (spacing, chip style, Apple HIG-oriented per `/ux` conventions) — clean and readable, not cramped.
- [ ] No hardcoded user-facing strings; any new label text goes through i18n (`packages/i18n/en.json` first).

### Open Questions
- None blocking. Icon choice for each non-dentist specialty is a reasonable-default UI decision (like the existing `hcoTypeIcon` map), not a data or compliance question — can be revised later via normal UX review if a specific icon doesn't land well.

### Hand-off
→ `/dev feat pwa-medico-mobile-card-parity` — scope is clear, self-contained (frontend-only, one shared component pattern applied consistently across already-identified views), no schema/architecture decisions needed.
