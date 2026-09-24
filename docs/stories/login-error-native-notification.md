## Refined User Story: Login error uses native notification

**Classification**: feature
**Raw input**: (NEO-10) "ikona x powinna byc na srodku, vertical. algo salio mal. /n intentalo de nuevo. pojawianie sie i znikanie tego tez mi sie nie podoba - chcialbym uzywac natywnej notyfikacji, tak jak dla reszty w aplikacji (rozumiem ze to mozliwe?) tego co jest na dole po prawej a na mobile na dole center. jak uda ci sie przeniesc to do notyfikacji natywnej to mozesz pominac nowa linie i stylowanie x z lewej storny." — screenshot showed the login form's inline error alert with a misaligned "x" (close) icon and the message "Algo salió mal. Inténtalo de nuevo."

**Redo note**: this ticket was implemented once already (branch `worker/neo-10-login-page-pwa`, 2026-09-17) but Łukasz asked for a full redo on 2026-09-20 — the prior pass shipped working code but no tests and no completion artifact. This story re-does the enrichment from scratch; the underlying technical investigation (notification host mount point, cross-package DI) carries over from that prior pass since it's still accurate against current `dev`.

### As a rep signing in, I want to see a login error as the same native toast notification used everywhere else in the app, instead of an inline alert box that pops in/out awkwardly

### Stakeholder Notes
- 👤 User: reps hit this every time they mistype a password or the API has a hiccup. A jarring inline alert with a misaligned close icon reads as unpolished on the very first screen of the app; a native toast (already familiar from the rest of the app) is a smaller, more consistent interruption.
- 🏢 Client: no client-specific behavior — purely a consistency/polish fix that benefits every tenant equally.
- 🩺 Patient: no downstream patient effect — this only touches how a login failure is surfaced to the rep, not any clinical or patient data flow.
- 🚀 NeoCRM/Platform: generalizable to any white-label tenant — the native toast system (`useNotifications`/`AppNotifications.vue`) is already tenant-agnostic (no hardcoded copy/branding), and this ticket just extends its reach to the previously-uncovered public/auth route tree.
  **Hoisting: platform** — this is not tenant-specific in any way; it's a shared component's reach being extended to a shared route.
- ⚖️ Compliance: no early flags — no new data collection, no PII in the toast beyond what the inline alert already showed (a generic i18n'd error string).

### Medical-Industry Trend Check
n/a — internal UI consistency fix, not a PCF/eDetail/HCP-engagement-pattern change.

### Investigation (carried over from the 2026-09-16 blocked pass, re-verified against current `dev`)
1. **Notification host wasn't mounted on the unauthenticated route tree.** `AppNotifications.vue` (the toast host, driven by `useNotifications()`) was mounted only inside `apps/pwa/src/layouts/AppLayout.vue` (the authenticated shell) — the public `/login` route (`LoginView.vue` → `packages/ui/src/views/AuthView.vue`, rendered via `PublicLayout.vue`) never mounted it. **Fix**: moved the mount point up to `apps/pwa/src/App.vue`, above the layout switch (`<component :is="layoutComponent" />`) — it's a `Teleport`-to-body, dependency-free singleton, so one instance now covers both `AppLayout` and `PublicLayout` routes instead of needing a second instance.
2. **`AuthView` lives in shared `packages/ui`**, which must not depend on `apps/pwa` directly. Bridged via the same string-key `provide`/`inject` pattern already used for `neo:apiFetch`/`neo:authTokenStorage` at this exact call site — a new `neo:notify` key, provided in `apps/pwa/src/main.ts` as `useNotifications().show`, injected in `AuthView.vue`.
3. **Positioning** ("bottom right on desktop, bottom center on mobile") already matches `AppNotifications.vue`'s current CSS (`.notif-hub` / `.notif-hub--mobile`, merged via NEO-8) — no separate positioning work needed.
4. **The literal "/n"** doesn't reproduce byte-level in `user.login.error.network` (`packages/i18n/mx.json`: `"Algo salió mal. Inténtalo de nuevo."`) — read as shorthand for the two-line wrap inside the old narrow `VAlert`, moot now that alert is removed from the sign-in step.

Given all of this, the x-icon/vertical-centering/transition complaints are Vuetify's own stock `VAlert` defaults on the sign-in step specifically — removing that alert (in favor of the toast) resolves them as a side effect rather than needing a separate CSS fix. Scope is limited to the **sign-in step's** error only; the forgot-password and reset-password steps' `VAlert`s are untouched (not mentioned in the ticket, and each already has its own dedicated "try again" affordance the toast system doesn't replicate).

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [x] A failed sign-in (401, 429, or any other non-ok/network-error response) shows the app's native toast notification (`AppNotifications`), not an inline `VAlert`, on the `/login` screen.
- [x] The toast shows for each of the sign-in flow's three error paths: invalid credentials (401), too many attempts (429), generic/network failure (any other non-ok response or a thrown error).
- [x] The notification host (`AppNotifications`) is mounted so it renders on the public/unauthenticated route tree (`/login`), not only inside the authenticated shell.
- [x] The notification host is mounted exactly once app-wide (no double-render between `App.vue` and `AppLayout.vue`).
- [x] `packages/ui`'s `AuthView.vue` gains no new dependency on `apps/pwa` — the bridge is via `provide`/`inject` only, matching the existing `neo:apiFetch`/`neo:authTokenStorage` convention.
- [x] Two consecutive failed sign-in attempts (even with the same error key) each produce their own toast notification, so a rep retrying with another mistake sees fresh feedback rather than silence.

### Open Questions
none — all three questions raised on the prior blocked pass were investigated and resolved (see Investigation above).

### Hand-off
→ `/dev feat login-error-native-notification` — scope is clear, small, and self-contained; implemented directly in this pass.
