## Refined User Story: Table/search border unification and footer styling

**Classification**: feature
**Raw input**: NEO-15 "pwa: search" — "ten search jak jest nieaktywny to ma miec border color jak pozostale tabele - to trzeba ujednolicic, bordery. footer na powiazanych tabelach tez: chcialbym poprawic stylowanie - ma byc bardziej medical grade i pasowac do naszej aplikacji. wszystkie widoki." (Translated: The search field's border color, when inactive, should match the border color used by the other tables — the borders need to be unified. The footer on related tables too: I'd like to improve the styling — it should be more medical-grade and match our app. All views.)

### As a rep/KAM/FFM/MSL using any entity list or detail view, I want to the search field, table borders, and table footer to share one consistent, medical-grade visual language so that the app reads as one coherent system instead of a set of components each individually assembled from Vuetify's generic defaults

### Stakeholder Notes
- 👤 User: Small visual inconsistency, but a daily-use one — every list view (leads, HCPs, HCOs, etc.) and every detail view with a related-entity tab shows this mismatch. Fixing it is low-effort, high-frequency polish rather than a new capability.
- 🏢 Client: A tenant's brand trust in a white-label CRM rides partly on visual polish — mismatched grays read as unfinished, which reflects on the licensing pharma company as much as on NeoCRM.
- 🩺 Patient: No downstream patient-safety or clinical-outcome effect — this is CSS-only styling, no data or workflow change.
- 🚀 NeoCRM/Platform: **platform** — the three touched components (`AppEntityList`, `AppDataTable`, `RelatedEntityPanel`) are shared, tenant-agnostic UI building blocks, not specific to any one tenant's data or branding. The fix generalizes to every white-label tenant automatically; no tenant-specific assumption is introduced.
- ⚖️ Compliance: No early flags — no PII, consent, or audit-relevant code is touched, only shared CSS/scoped styles.

### Medical-Industry Trend Check
n/a — internal design-consistency change, not a clinical workflow or HCP-engagement feature.

### Acceptance Criteria (testable)
- [ ] The search field's border color, when not focused, equals the border color used by `AppEntityList`'s table wrap, `AppDataTable`'s table wrap, and `RelatedEntityPanel`'s item dividers (all four resolve to the same `--pwa-table-border` token, in both light and dark themes).
- [ ] The search field's focused-state border color is unchanged (still the app's primary color) — only the inactive state moves.
- [ ] `AppEntityList`'s data-table pagination footer has a visible top border and de-emphasized (medium-emphasis) text, instead of rendering with no visual separation from the rows above it (Vuetify's unstyled default).
- [ ] The footer's "rows per page" control's own border also uses the unified table-border token.
- [ ] No behavior change: search, filtering, pagination, and related-entity list loading/error/empty states all work exactly as before.

### Open Questions
- none

### Hand-off
→ `/dev feat table-search-border-unification` — scope is clear, small, self-contained CSS/style-token consistency fix; no data model or cross-cutting architecture involved.
