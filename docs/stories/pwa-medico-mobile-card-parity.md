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
- [x] On mobile (card view), the HCP/practitioner list shows: institution/clinic name as plain text (not a clickable link, unlike the desktop table), territory name, and specialty as a labeled chip.
- [x] The specialty chip has an icon on its left matching the specialty; dentist specifically uses a tooth icon.
- [x] Desktop table view for practitioners is unchanged (still links institution).
- [x] `LeadsView.vue`, `TerritoriesView.vue`, `TreatmentPlansView.vue`, and `SleepStudiesView.vue` mobile cards show the same columns their desktop tables already show (per the gaps listed above).
- [x] No new or modified backend route/query — all data comes from already-existing API responses.
- [x] Mobile cards remain visually consistent with the rest of the app's card style (spacing, chip style, Apple HIG-oriented per `/ux` conventions) — clean and readable, not cramped.
- [x] No hardcoded user-facing strings; any new label text goes through i18n (`packages/i18n/en.json` first).

### Test Coverage Map
| Acceptance Criterion | Test(s) | How verified |
|---|---|---|
| Mobile card shows institution + territory (AC1, `hcpCardMeta` formatting) | `apps/pwa/src/utils/mobileCardMeta.spec.ts` › `hcpCardMeta` (3 tests: institution+territory join, region fallback, empty-state dash) | Automated unit test |
| Specialty chip icon, incl. dentist's distinct tooth icon (AC2) | `apps/pwa/src/utils/hcpLabels.spec.ts` › `practitionerSpecialtyIcon` (3 tests: dentist, other seeded specialties, unseeded/missing fallback) | Automated unit test |
| Other views' mobile card parity (AC4: territory/treatment-plan/sleep-study formatting) | `apps/pwa/src/utils/mobileCardMeta.spec.ts` › `territoryCardMeta`, `treatmentPlanCardMeta`, `sleepStudyCardMeta` (7 tests total) | Automated unit test |
| Desktop table unchanged, still links institution (AC3) | — | Diff review: `apps/pwa/src/views/HCPView.vue`'s `#item.institution` slot (still `<EntityLink>`) is untouched by this change; no automated regression test exists for this view yet (no prior `AppEntityList`-mounting spec in the codebase to extend) — flagged as a manual QA checklist item below, and as a coverage gap worth a dedicated `HCPView.spec.ts` in a follow-up |
| No new/modified backend route/query (AC5) | — | Diff review: `git diff origin/dev...HEAD --stat` touches only `apps/pwa/src/**` and `docs/**`, zero `apps/api/**` changes |
| Visual consistency / spacing / Apple HIG (AC6) | — | Subjective/visual — manual QA checklist item below, not unit-testable |
| No hardcoded strings, i18n-first (AC7) | — | Diff review: no new translatable label text was introduced (card-meta separators are literal punctuation, `—`/`·`, not prose); all rendered labels reuse existing `t()`-backed lookups (`specialtyLabel`, `typeLabel`, `studyTypeLabel`, territory `kind` keys) |

Note: this table was added retroactively (2026-09-20) after the original implementation (pushed 2026-09-17) shipped with no automated tests and no completion Artifact — see NEO-19 Linear comments for context. `mobileCardMeta.ts` was extracted out of the four view files specifically to make this coverage possible without a heavier full-component-mount harness.

### Open Questions
- None blocking. Icon choice for each non-dentist specialty is a reasonable-default UI decision (like the existing `hcoTypeIcon` map), not a data or compliance question — can be revised later via normal UX review if a specific icon doesn't land well.

### Hand-off
→ `/dev feat pwa-medico-mobile-card-parity` — scope is clear, self-contained (frontend-only, one shared component pattern applied consistently across already-identified views), no schema/architecture decisions needed.
