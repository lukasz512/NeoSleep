## Refined User Story: PWA "Record stack" paper look + motion

**Classification**: feature — an app-wide visual change a user or tenant could reasonably push back on.
**Raw input**: "chcę lepsze animacje i bardziej kartkowy wygląd strony" → picked "Wariant C + animacje" from the proposal artifact (https://claude.ai/artifact/XFxAZaSAVgL56X5qxhdrAt). Linear: NEO-85.

### As a rep / doctor / manager using the PWA, I want the app to read like a stack of patient record sheets, with calm, purposeful motion, so that screens feel tangible and legible instead of like a flat spreadsheet

### Stakeholder Notes
- 👤 User: Reps and doctors use it on tablets and phones between visits. Depth and press feedback make touch targets feel answered. Motion must be short and never delay work.
- 🏢 Client: This is a first-impression/perceived-quality lift for the tenant's field force. It must keep the tenant's own primary colour (app_config), so the "teal" is always the brand primary, never a hardcoded hex.
- 🩺 Patient: No downstream patient effect. Pure presentation; no data, flow or permission changes.
- 🚀 NeoCRM/Platform: Applies to every tenant through shared tokens (theme.scss, AppShell, AppEntityList, AppFormDialog). White-label safe as long as colours derive from the primary.
- ⚖️ Compliance: Accessibility only. It must honour `prefers-reduced-motion`, and the contrast of hairlines and text on the tinted ground must stay AA. No GDPR flags.

### Medical-Industry Trend Check
- n/a (internal visual system change; direction chosen visually by Łukasz from a live mock).

### Acceptance Criteria
- [ ] Light theme: the page ground behind the content is the teal-grey desk tone (#e8eeec, derived from the primary). The content area is a white sheet with a soft layered shadow and two offset sheets visible under its bottom edge (desktop and phone).
- [ ] Entity lists (table + phone feed): rows are separated by ruled hairlines in a primary tint instead of outlined boxes. The table column header is in the primary colour with a 1.5px rule.
- [ ] Dialogs (AppFormDialog / AppConfirmDialog): white paper, deep soft shadow, one sheet visible under the bottom edge on desktop. The filled primary pill is the main action in form dialogs.
- [ ] Motion: the sheet rises and fades in on route change, and list rows stagger in. Rows give hover tint and press feedback. Dialogs grow from the element that opened them and close faster. On phone widths the form dialog is a bottom sheet sliding up. Fields show a primary halo on focus.
- [ ] `prefers-reduced-motion: reduce` disables movement (opacity-only or instant).
- [ ] Dark theme gets the same structure with a darker ground than the sheet and no light "paper" artefacts.
- [ ] A tenant with a different primary colour gets the tints in its own colour (no hardcoded teal in the new rules).
- [ ] Form dialogs still scroll, and the existing dialog e2e specs (dialog-scroll, dialog-header) stay green.

### Open Questions
- [x] Phone dialog is a bottom sheet sliding up (confirmed by Łukasz 2026-09-26: "dialog od dołu na telefonie").

### Hand-off
→ `/dev feat pwa-record-stack-paper-look` (scope is clear and presentation-only)
