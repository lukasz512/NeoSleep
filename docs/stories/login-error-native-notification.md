## Refined User Story: Login error uses the native notification instead of an inline alert

**Classification**: feature
**Raw input** (NEO-10, "login page, pwa"): "ikona x powinna byc na srodku, vertical. algo salio mal. /n intentalo de nuevo. pojawianie sie i znikanie tego tez mi sie nie podoba - chcialbym uzywac natywnej notyfikacji, tak jak dla reszty w aplikacji (rozumiem ze to mozliwe?) tego co jest na dole po prawej a na mobile na dole center. jak uda ci sie przeniesc to do notyfikacji natywnej to mozesz pominac nowa linie i stylowanie x z lewej storny."

### As a rep signing into the PWA, I want to see a login error the same way I see every other error in the app so that the login screen doesn't feel like a different, less-polished part of the product

### Stakeholder Notes
- 👤 User: Reps hit this on every mistyped password or backend hiccup — it's one of the most-seen error states in the app. Consistency with the toast used everywhere else (NEO-8's refactor) reduces surprise and looks/feels native instead of a stock Vuetify alert with default styling.
- 🏢 Client: Purely a polish item on a white-label surface every tenant's reps see daily — small but visible quality signal, no tenant-specific behavior.
- 🩺 Patient: No downstream patient effect — this only affects how a login failure is displayed.
- 🚀 NeoCRM/Platform: The fix generalizes (packages/ui's `AuthView` is shared, injection-based, host-app-agnostic) rather than being pwa-only special-casing, so any future app built on packages/ui gets the same behavior for free once it wires the same `neo:notify` injection apps/pwa now provides.
- ⚖️ Compliance: No early flags — no PII, no auth-logic change, only where/how an existing error message is displayed.

### Investigation (resolves the three Open Questions a prior worker run blocked on)
1. **Notification host wasn't mounted on the unauthenticated route tree.** Confirmed: `AppNotifications.vue` was only rendered inside `AppLayout.vue` (the authenticated shell); `PublicLayout.vue` (used for `/login`, `/forgot-password`, `/reset-password`) never mounted it. Resolved by relocating `<AppNotifications />` one level up, into `App.vue`, above the `PublicLayout`/`AppLayout` switch — `useNotifications.ts` is a dependency-free module-level singleton (no auth/store requirement), so a single top-level instance serves both layouts with no duplication.
2. **Package boundary**: `AuthView.vue` lives in `packages/ui` (shared, app-agnostic — no dependency on `apps/pwa`), so it cannot import `apps/pwa`'s `useNotifications`/`AppNotifications` directly. Resolved using the same `provide`/`inject` bridge already established in this codebase for `neo:apiFetch` / `neo:authTokenStorage` (`main.ts` → `AuthView.vue`): added `app.provide("neo:notify", ...)` in `apps/pwa/src/main.ts`, injected as `neo:notify` in `AuthView.vue`.
3. **Positioning claim ("bottom-right desktop / bottom-center mobile") didn't match the code at the time of the prior block.** NEO-8 ("refactor toast notification system", merged since) implemented exactly this split (`AppNotifications.vue`'s `.notif-hub` / `.notif-hub--mobile`), so the ticket's description of the native notification now matches current code — no further positioning work needed here.
4. **The literal "/n" doesn't reproduce** in `user.login.error.network` (`"Algo salió mal. Inténtalo de nuevo."`, no embedded newline) — read as Łukasz's own shorthand for the two-sentence message wrapping onto its own line inside the narrow `VAlert`, not a literal character bug. Moot once the login error moves to the toast (per the ticket's own closing line: skip fixing the newline/x-icon styling if the move to native notification succeeds).

### Acceptance Criteria
- [x] A login failure (invalid credentials, too-many-attempts, or generic network/server error) shows via the app's native toast (`AppNotifications`, bottom-right on desktop / bottom-center on mobile, 8s auto-dismiss, swipe/click to dismiss) instead of an inline `VAlert` on the sign-in step.
- [x] The toast is visible on `/login` (previously the notification host wasn't mounted there at all).
- [x] No change to the forgot-password / reset-password steps' own alerts (out of scope — ticket is about the login page specifically).
- [x] `AuthView.vue` stays host-agnostic (no direct import of an `apps/pwa`-specific module) — bridged via the same `provide`/`inject` pattern already used for `apiFetch`/`authTokenStorage`.

### Medical-Industry Trend Check
n/a — internal UI consistency fix, not benchmarked against external practice.

### Open Questions
none

### Hand-off
→ `/dev feat login-error-native-notification` (implemented directly by this worker run — scope was small, self-contained, and fully resolved by the investigation above)
