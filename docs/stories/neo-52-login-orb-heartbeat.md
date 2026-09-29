# NEO-52 — PWA login: breathing orbs, card zoom, canvas-dissolve exit, staggered app-shell entrance

Linear: NEO-52 · Branch: `worktree-neo-52-login-orb-heartbeat`

## Refined user story

As a rep opening the PWA, I want the login screen to feel alive and calm from the very first
frame — the medical background and the brand orbs visible immediately, breathing slowly, and
breathing faster whenever something is loading — so that the wait for the session check or
sign-in reads as "the app is working" rather than a blank or frozen screen. After signing in,
I want the login screen to hand over to the app in one continuous motion instead of a cut.

## Decisions (clarified with Łukasz, 2026-09-24)

| Question | Decision |
|---|---|
| Which loading states speed up the orbs? | App start / session check, sign-in submit, forgot-password submit, reset-token validation + reset submit. Idle = very slow, loading = somewhat faster. |
| Rhythm shape | Single soft breath (not a lub-dub double beat). Bigger orb = slower period; small per-cycle jitter so it never feels like a metronome. |
| Exit metaphor ("orbs pull the canvas away") | Card disappears first, then the orbs expand past the screen edges while the background dissolves (fade + slight swell + blur) together with them. |
| App-shell entrance | Parts appear top → bottom (app bar, drawer, main content, bottom nav), each from nothing, rising slightly from below; fast start, smooth end (expo-out). |

## Acceptance criteria

1. Background + orbs are visible from the first paint of any public route, including while the
   router guard is still resolving the session (previously: blank white screen).
2. Orbs breathe continuously (scale + opacity), idle periods ~8–11 s, busy periods ~2–2.6 s;
   switching idle ↔ busy eases over ~1 s, never jumps mid-breath.
3. Every AuthView wait (sign-in, forgot submit, reset validation/submit) marks the backdrop busy;
   it returns to idle when the wait ends, including on errors.
4. The auth card zooms out of the orb cluster on entrance and shrinks back into it on exit.
5. Post-login exit order: badge + logo → card → orbs expand + background, dot field and settings
   chip dissolve together → navigation.
6. After login the app shell enters top → bottom with a stagger; Vuetify's own drawer/app-bar
   transitions are restored once the entrance finishes.
7. `prefers-reduced-motion`: no breathing loop, no zoom/blur/stagger — instant states.
8. If the post-login route is public too (forced password change), the background and orbs come
   back instead of leaving a bare page.

## Architecture note

The orbs moved from `AuthView` (packages/ui) into the app's public layout via a new
`AuthOrbs` component, because `AuthView` only mounts after the router guard's session check —
anything it owns cannot be on screen during that wait. The layout ↔ view contract is
`AUTH_BACKDROP_KEY` / `AuthBackdrop` (`packages/ui/src/composables/authBackdrop.ts`):
`setBusy`, `registerAnchor` (orbs align behind the card slot), `whenEntered`, `playExit`.
It replaces the old single-purpose `AUTH_BACKGROUND_EXIT_KEY`. Platform-generic — no
tenant-specific logic; tenants still restyle via brand colors/background URL.

## Robustness pass — first paint (2026-09-24)

Łukasz reported ~12 s before *anything* appeared. Measured (headless Chromium, 390×844):

| Scenario | Before | After |
|---|---|---|
| Cold `vite` dev server — backdrop visible | 22.0 s | 0.36 s |
| Slow API (session check 8 s) — login card visible | 8.2 s | 2.7 s |
| Slow API (session check 25 s, prod build) — login card visible | up to 20 s (request timeout) | 2.6 s |
| Throttled network (~1.6 Mbit, 300 ms RTT, prod) — first paint | 2.15 s | 0.39 s |

Root causes and fixes:

1. **Nothing paints until JS runs** — index.html was an empty `<div id="app">`. Now a static
   HTML/CSS boot splash (`apps/pwa/src/boot/splash.ts`, injected by a Vite `transformIndexHtml`
   plugin) paints the photo, gradient and breathing orbs from the HTML itself. Vue takes over
   in place (`AuthOrbs instant`, background already visible) and the splash crossfades off.
2. **~650 KB bundle CSS was render-blocking** — the browser painted nothing, splash included,
   until it downloaded. It is now a `rel="preload" as="style"` link; `main.ts` switches it to a
   stylesheet first thing, and the splash only lifts once it has applied (10 s safety timeout),
   so the app never shows unstyled. `registerSW.js` is now `defer`.
3. **Login form waited for the full session check** (router guard, up to apiFetch's 20 s
   timeout on a cold Render API). Capped at `SESSION_CHECK_BUDGET_MS` = 2.5 s; the check keeps
   running in the background (orbs stay "busy" via `auth.sessionChecking`) and redirects to the
   app if it finds a valid session. The auth store now dedupes concurrent checks and ignores a
   late answer if a login/logout happened meanwhile (`authGeneration`).
4. **Cold dev server** — `server.warmup` pre-transforms the entry graph at startup.

## Out of scope / follow-ups

- Restored-session path (valid refresh token → straight to `/patients`) still swaps
  PublicLayout → AppLayout without the dissolve exit (App.vue layout switch has no
  transition hook). The orbs do breathe "busy" during that check now.
- Staggering the individual blocks *inside* each routed page (headers, filters, lists) is not
  part of this change — the main content area enters as one block.
