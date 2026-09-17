## Refined User Story: Login page loading state (pulsing orbs during session check)

**Classification**: feature — this is a UX/workflow change to a shared auth screen (not a typo or unambiguous bugfix); the exact loading treatment is a design call someone could reasonably push back on.

**Raw input**: "jak api sie wczytuje to nic sie nie pojawia na tej stornie... to jest troche do zmiany - moze loader? tylko jakos taki wiekszy, albo niech sama strona loginu sie pojawia w trybie loadingu... poza tym jak sie laduje to kulki moglyby pulsowac - nie za szybko ale plynnie" — when the API session check is loading, nothing appears on the login page; wants either a bigger loader or the login page itself to appear already in a loading mode; follow-up: the decorative orbs could pulse gently (not too fast) during that load.

### As a rep/KAM/MSL/FFM opening the pwa app, I want to see something alive on screen immediately instead of a blank gradient so that I trust the app is working, not stuck or broken, especially on a cold API start

### Stakeholder Notes
- 👤 User: Every field-force user hits this on their very first paint of the app (and again after any session expiry). A blank screen for several seconds — worse on Render's free-tier cold start — reads as "the app is broken," eroding trust before they've even logged in.
- 🏢 Client: The white-label tenant's perceived polish is judged from this exact first-impression screen — it's the one screen every new rep and every demo to a prospective tenant sees first. A blank flash undermines the "medical-grade" positioning `/ux` and `/arch` have been building toward.
- 🩺 Patient: No downstream effect — this is a pre-authentication loading-state polish with no data or clinical workflow implication.
- 🚀 NeoCRM/Platform: `PublicLayout`, `AuthView`, and the router guard are shared infrastructure used by every white-label tenant identically — fixing this once benefits all current and future tenants, not just the active ones. Worth doing generally rather than as a one-off tweak.
- ⚖️ Compliance: No early flags — no personal data or auth-flow security semantics change, purely a loading-state visual.

### Medical-Industry Trend Check
n/a — internal loading-state/infra polish, not a clinical or patient-facing workflow feature.

### Root cause (confirmed by reading the code, not assumed)
`apps/pwa/src/router/index.ts`'s `beforeEach` guard does `await auth.fetchSession()` before calling `next()` for `/login`, `/forgot-password`, and any `requiresAuth` route. Vue Router doesn't resolve `<RouterView>`'s matched component until `next()` fires, so `AuthView` (which owns the decorative orbs, `AuthCard`, and the sign-in form) never mounts during that await. `App.vue`'s layout picker (`route.meta.layout`) defaults to `PublicLayout` before the route resolves, so the animated background *does* show — but nothing inside it does, which is exactly the blank-except-background screenshot Łukasz shared. The orbs currently live entirely inside `AuthView.vue` (`.auth-view__orb*`), so they don't exist yet at the point where the blank gap happens.

### Acceptance Criteria (testable)
- [ ] On first load (and on any reload) of `/login`, `/forgot-password`, or a deep link to a `requiresAuth` route, the user sees the decorative orbs pulsing gently — not a blank gradient — for the entire duration of `auth.fetchSession()`, however long it takes (including a Render cold start of several seconds).
- [ ] The loading pulse reuses the existing `auth-view-orb-pulse` keyframe timing/feel (gentle, not fast) rather than introducing a new animation — skip the pop-in/pop-out choreography for this pre-navigation state.
- [ ] `prefers-reduced-motion: reduce` shows the orbs in a static (non-pulsing) resting state during the load, consistent with how `AuthView` already handles reduced motion elsewhere.
- [ ] Once `fetchSession()` resolves and the real route mounts, the handoff from "loading pulse" to `AuthView`'s existing entrance sequence (orb pop-in → card → chrome → badge) is visually continuous — no flash, jump, or momentarily-duplicated orbs.
- [ ] On a warm/fast session check (no visible delay), the screen must not look or feel slower than it does today — no artificial minimum-loading-time added.
- [ ] Same treatment applies uniformly to `/login`, `/forgot-password`, and the `requiresAuth` blank-gap case — not just `/login` — since all three hit the same awaited `fetchSession()` guard.

### Open Questions
- [ ] Where should the "loading" orbs live — moved up into `PublicLayout` (shared across all its routes) as a new small component, or a separate lightweight loading view rendered before the router resolves? This is an ownership/architecture call, not just styling.
- [ ] Does `AppLayout` (post-login, `requiresAuth` routes reached via a deep link before a session is known) need the same pulsing treatment, or is a blank-then-redirect-to-`/login` acceptable there since the destination is behind auth anyway?
- [ ] Is there any reasonable timeout/fallback needed if `fetchSession()` hangs unusually long (e.g. Render cold start beyond a few seconds), or does the orb pulse alone suffice as "still alive" feedback indefinitely?

### Hand-off
→ `/arch assess login-loading-state` — the orbs currently live inside `AuthView.vue`; deciding where a pre-navigation loading indicator should live (`PublicLayout` vs. a new shared component) is a cross-cutting UI-infra decision shared by every white-label tenant, not a one-file styling tweak.
→ `/dev feat login-loading-state` — once the component ownership is settled, implementation is small and self-contained (reuse existing CSS keyframe, no schema/data changes).
