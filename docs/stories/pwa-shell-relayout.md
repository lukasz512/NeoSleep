## Refined User Story: PWA shell relayout (NEO-55)

**Classification**: feature (workflow-visible navigation change across every authenticated screen)
**Raw input**: "logo neosleep po lewej top (tam gdzie teraz tytul menu); tytul menu jako tytul card tego gdzie jest app (potem pojawia sie tam strzalka wstecz, wiec za strzalka ma byc ten tytul); logo usera i nazwa top right, tam gdzie bylo logo." Mobile: option A (bottom bar + "More") chosen from https://claude.ai/artifact/5CWhknv6AHhwQMkVNai468. No logo on mobile. The logo sits in the top bar and does not collapse with the left menu. "More" lists only the remaining modules; the account menu stays under the avatar.

### As a field rep, I want one visible, predictable navigation and my account always in the same corner, so that I can move between modules one-handed between visits without hunting for a hidden menu.

### Stakeholder Notes
- 👤 User: reps/KAMs/MSLs/managers on phone and desktop. Today there are two routes to the same modules on mobile (hamburger + bottom bar). The account is buried at the bottom of the drawer.
- 🏢 Client: tenant branding moves to a more prominent spot on desktop (top-left). It disappears from the mobile chrome, which is acceptable because it stays on login, the app icon and the theme colors.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: the logo is already slot-driven (white-label safe). Bottom-bar items are still "first 4 nav items". Per-role configuration is deferred.
- ⚖️ Compliance: no early flags. Accessibility: the "More" tab and the avatar need aria labels, and the sheet needs focus handling (VBottomSheet provides it).

### Medical-Industry Trend Check
- Salesforce Mobile (incl. Life Sciences Cloud): bottom navigation bar with a "Menu" item for everything else.
- Apple HIG tab bars / Material 3 navigation bar: 3–5 destinations, with the overflow under "More".
- NN/g research on hidden navigation: discoverability drops when navigation hides behind an icon.

### Acceptance Criteria
- [ ] Desktop: the logo is at the top-left of the full-width app bar. It keeps full size when the left menu collapses to the rail. Clicking it navigates to /dashboard.
- [ ] Desktop: avatar + name + role are at the top-right. Clicking opens the existing account menu (theme, language, logout) below it.
- [ ] Desktop: the left menu has nav links, the collapse chevron and the version label, and no account button.
- [ ] The module icon + title render as the first row inside the content area, not in the app bar.
- [ ] Detail views (lead/hcp/hco/patient/user/document-editor) show a back arrow followed by the module title in that same row. The old separate back-arrow row is gone.
- [ ] Mobile: no hamburger, no logo. The top bar shows [back on detail] + title on the left and the avatar on the right.
- [ ] Mobile: the bottom bar has the first 4 visible nav items + "More". "More" opens a bottom sheet listing the remaining visible nav items only. Tapping one navigates and closes the sheet.
- [ ] Mobile: "More" is shown as active when the current route belongs to one of the overflow modules.
- [ ] The notification dot on Dashboard still works in the bottom bar.
- [ ] All new strings are in en/pl/mx.

### Open Questions
- none (all resolved with Łukasz on 2026-09-24)

### Hand-off
→ `/dev feat pwa-shell-relayout`: scope is decided, UI-only, no schema.
