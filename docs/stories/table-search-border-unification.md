## Refined User Story: Unify table/search border color and footer styling

**Classification**: feature
**Raw input** (Linear NEO-15, Polish, from Łukasz): "ten search jak jest nieaktywny to ma miec border color jak pozostale tabele - to trzeba ujednolicic, bordery. footer na powiazanych tabelach tez: chcialbym poprawic stylowanie - ma byc bardziej medical grade i pasowac do naszej aplikacji. wszystkie widoki." An attached screenshot existed on the ticket but its signed URL had already expired by the time this run tried to fetch it — proceeding on the text description alone, per the linear-worker skill's contract for unreadable attachments.

Translation: when the search field is inactive (not focused), its border color should match the border color used on tables elsewhere — borders need to be unified across the app. Same request for the footer on related-record tables: improve the styling to be more "medical grade" and consistent with the rest of the app. Applies to all views.

### As a rep/KAM/FFM/MSL using the PWA, I want to see one consistent border and footer style across every table and the search field so that the app looks coherent and deliberately designed rather than assembled from mismatched defaults

### Stakeholder Notes
- 👤 User: Purely visual — no workflow change. A rep scanning a list view benefits from consistent visual weight; inconsistent borders/unstyled footers read as unfinished/unpolished on a tool used daily.
- 🏢 Client: Tenant admins and pharma clients evaluating the white-label product judge polish directly — a visibly inconsistent, "un-styled Vuetify defaults" footer undercuts the "medical grade" positioning this platform sells on.
- 🩺 Patient: No downstream patient-safety or clinical-outcome effect — purely cosmetic/CSS.
- 🚀 NeoCRM/Platform: Yes — this fixes a shared component (`AppEntityList.vue`/`AppDataTable.vue`) used across 9+ list views, so the fix generalizes to every current and future tenant automatically; it's exactly the kind of shared-component investment that pays off white-label-wide.
- ⚖️ Compliance: No early flags — CSS-only change, no PII/data-access surface touched.

### Investigation findings (Explore agent, this run)
- The search field's border comes from Vuetify's outlined-field rule in `apps/pwa/src/assets/theme.scss` (`--v-theme-outline` at rest / `--v-theme-primary` on focus).
- `AppEntityList.vue`'s table border uses `--v-theme-outline-variant` (`AppEntityList.css`); `AppDataTable.vue`'s table border uses `--v-border-color` (a different Vuetify token). These two already disagree with each other, and neither matches the search field's `--v-theme-outline`.
- `theme.scss` already defines a dedicated, unused token for exactly this: `--pwa-table-border` (`#e0e0e0` light / `#3a3a3a` dark) — defined once, consumed nowhere (confirmed via repo-wide grep). This is the intended fix target rather than inventing a new value.
- No dedicated footer component exists. `AppDataTable.vue` suppresses Vuetify's footer entirely (`<template #bottom></template>`); `AppEntityList.vue`'s `VDataTableServer` renders Vuetify's **unstyled default** pagination footer (zero CSS rules target `.v-data-table-footer` anywhere in the repo); `RelatedEntityPanel.vue` has no footer at all, just `<ul>` dividers on yet another border token (`--v-border-color`).
- Roughly 15 files reference one of the three border-token families inconsistently (`AppEntityList.css`, `AppDataTable.vue`, `RelatedEntityPanel.vue`, `ItemDetailLayout.vue`, `PatientStudiesPanel.vue`, `PatientNotesPanel.vue`, `OrthoApneaTransactionLog.vue`, `OrthoApneaOrderComments.vue`, `IconOptionPicker.vue`, `SignaturePad.vue`, `EntityHistoryPanel.vue`, `UserDetailView.vue`, `PlannerView.vue`, `PresentationsView.vue`, `LeadDetailView.vue`, plus `theme.scss`'s global outlined-field rule).

### Acceptance Criteria (testable)
- [ ] The search field's inactive (unfocused) border color and every table/list border color resolve to the same token (`--pwa-table-border`), in both light and dark themes.
- [ ] `AppEntityList.vue`, `AppDataTable.vue`, and `RelatedEntityPanel.vue` no longer reference `--v-theme-outline-variant` or `--v-border-color` for their border styling — all three use `--pwa-table-border` consistently.
- [ ] `VDataTableServer`'s pagination footer in `AppEntityList.vue` gets explicit styling (top border using `--pwa-table-border`, padding/typography consistent with the rest of the app) instead of Vuetify's unstyled default.
- [ ] No functional/behavioral change — this is CSS-only; existing component tests continue to pass unmodified.
- [ ] Change applies uniformly across all views that use these shared components (no per-view one-off overrides left behind).

### Open Questions
- None blocking. "Medical grade" footer styling is interpreted conservatively: reuse the existing border token and match the visual weight (padding, font-size, color) already established by neighboring components (e.g. table header rows) rather than introducing new colors, shadows, or a new visual language — low-risk, easily iterated on visually in a follow-up if the actual reference screenshot becomes available again.

### Hand-off
→ `/dev feat table-search-border-unification` — scope is clear, self-contained, no schema/architecture impact; proceeding directly to implementation per the linear-worker skill's own flow.
