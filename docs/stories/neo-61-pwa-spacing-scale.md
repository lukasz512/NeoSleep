## Refined User Story: PWA spacing scale + shell rhythm (NEO-61)

**Classification**: feature. It changes the look of every screen, and Łukasz picks between visual options, so it isn't a one-line fix.
**Raw input**: "Fix the spacing on this card — breadcrumbs, tables, buttons etc. — everything must be nicely UX-aligned. On mobile the app has too little air; check the whole skeleton and set spacing to good-UX defaults." Follow-up: "Tabs on desktop need a limited width, it has to look good; propose several nice, medical-looking tab patterns for mobile. The bottom bar can be fixed too; on tablet, give the icons a max width so they don't span the whole bar."

### As a rep / manager / doctor using the PWA on a phone, tablet or desktop, I want screens with consistent, generous spacing so that I can scan a patient record quickly and tap the right control the first time

### Stakeholder Notes
- 👤 User: reps use the app one-handed on phones and on tablets during visits. Cramped headers and truncated tabs ("Studi…", "Histo…") slow them down and cause mis-taps.
- 🏢 Client: a polished, calm UI is part of what a pharma tenant buys in a white-label product. The spacing scale lives in `packages/brand`, so it applies to every tenant.
- 🩺 Patient: indirect only. A truncated clinical tab (Studies, Documents) is easier to miss, so readable tabs slightly lower the risk of missing clinical information. No data change.
- 🚀 NeoCRM/Platform: the tokens stop spacing drift across future views and future tenants.
- ⚖️ Compliance: no early flags. Touch targets stay ≥ 44px (WCAG 2.5.5 / Apple HIG).

### Medical-Industry Trend Check
- n/a for data. Design references rather than market research: the Material 3 window-size classes set margins of 16 / 24 / 24+ dp for compact, medium and expanded layouts, and Apple HIG uses a 16–20pt content margin with 44pt minimum tap targets. Salesforce SLDS and Veeva (the pattern NEO-56 already follows) use a 4-px spacing scale.

### Acceptance Criteria
- [ ] `packages/brand` exposes `--space-1/2/3/4/6/8/12` (4…48px) and `--page-gutter` (20px < 600px, 24px 600–1279px, 32px ≥ 1280px).
- [ ] The AppLayout content inset reads `--page-gutter`. The app-bar edges (NEO-55 logo/avatar alignment) still line up with the content at every breakpoint.
- [ ] Record header: tile ↔ name 16px, header → tabs 24px, action buttons are 44px boxes with an 8px gap.
- [ ] Desktop detail tabs: every label is shown in full (no ellipsis), and the bar is only as wide as its content (no 600px equal-slot cap).
- [ ] Tabs → tab content is one 32px gap (the 28 + 10 workaround is gone), and the floating label of an outlined field is still not clipped.
- [ ] History timeline: entries 24px apart, day groups 32px apart, day label → first entry 16px.
- [ ] Mobile bottom bar: spacing is on the scale. On tablet width (≥ 600px) the item row is centred with a max width, so the icons don't spread across the whole bar.
- [ ] Mobile detail tabs: implemented in the pattern Łukasz picks from the proposal artifact.
- [ ] Before/after screenshots of the running app at 360 / 768 / 1440px in the NEO-61 artifact.

### Open Questions
- [ ] Mobile tab pattern: Łukasz picks from the options in the artifact.

### Hand-off
→ `/dev feat pwa-spacing-scale`: scope is clear and visual-only. There is no schema or architecture impact, so /arch is not needed.
