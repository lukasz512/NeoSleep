# NEO-12 — Login PWA badge follows the theme

**Ticket:** NEO-12 ("pwa login")
**Status:** implemented on `worktree-neo-12-pwa-badge-white`, awaiting live check on `/login`

## Story

As anyone opening the PWA login page, I want the "PWA" badge under the login card to blend with the page instead of standing out, in both light and dark mode.

## Scope decision

The ticket's screenshot (133×78, the badge only) shows the request is about the badge asset, **not** the app-wide theme. The earlier worker passes couldn't open the image and asked about changing the shared brand palette and Vuetify surface tokens. Neither is needed, and neither was touched.

## Acceptance criteria

1. Light mode: the badge shows white P and A and a light lavender (#C4B5FD) W.
2. Dark mode: the badge shows dark grey (#3D3D3D) P and A and a purple (#5A0FC8) W.
3. Toggling the theme on the login page swaps the badge immediately, with no reload.
4. The badge's size, fade-in and magnetic-pointer behavior are unchanged.
5. No other screen changes (brand palette and theme tokens untouched).

## Implementation

- `packages/brand/logos/pwa/pwa-badge.png` (light mode) was recolored from the original asset. The letter shapes and anti-aliasing were preserved.
- `packages/brand/logos/pwa/pwa-badge-dark.png` (dark mode) is the original asset.
- `BRAND_PWA_BADGE_DARK_URL` was added to `packages/brand/logos.ts`, next to the light-mode `BRAND_PWA_BADGE_URL`.
- `AuthView.vue` picks the URL from `useThemeStore().mode`, which is the same theme source `AuthChrome` uses for the logo.

## Tests

| AC | Test |
|---|---|
| 1 | `AuthView.pwaBadge.spec.ts` › light mode › dominant colors are white + #c4b5fd; no dark pixels |
| 2 | `AuthView.pwaBadge.spec.ts` › dark mode › dominant colors are #3d3d3d + #5a0fc8 |
| 3 | `AuthView.spec.ts` › PWA badge follows the theme › light → dark switches src live |
| 4 | Existing `AuthView.spec.ts` suite (unchanged, passing) |

## Follow-up (2026-09-24): badge sizing + app version under it

Łukasz's follow-up asked for the badge at **20px tall and 70% opacity**, and for the **app version** under it. The version should look serious, medical and minimal, and be white in light mode and dark in dark mode. No versioning existed before this: no `version` field, no release tags, and `VITE_APP_VERSION` was never set by CI. Numbering therefore starts at 1.

Decisions (asked and answered in-session):

| Question | Decision |
|---|---|
| Format | `Version 1.0.0 (build N)`: semver plus a monotonically increasing build number, so every build is identified unambiguously (IEC 62304-style) |
| Source | Semver in `apps/pwa/package.json`, bumped by hand at release. The build number comes from CI: `github.run_number − 114` in `deploy-pwa.yml`, where run 114 was the last deploy before this |
| DEV vs PROD | Prod: no suffix. Dev: `· DEV`. Local dev server: `· LOCAL`, with no build number |
| Placement | Under the badge, 11px, tabular numerals, same 70% opacity and fade-in as the badge |

### Acceptance criteria (follow-up)

6. The badge renders 20px tall at 70% opacity in both themes.
7. The version line reads `Version <semver> (build <N>)`, with `· DEV` appended on pwa-dev and nothing appended on prod.
8. The version text is white in light mode and #3D3D3D in dark mode, and switches with the theme like the badge.
9. A missing or malformed build number is never rendered: no "build 0", "build NaN" or negative numbers.
10. An app that doesn't provide a version renders no version line.

### Implementation (follow-up)

- `packages/stores/src/appVersion.ts`: `AppVersionInfo` type plus the `APP_VERSION_KEY` injection key. It lives in `@stores`, not `@ui`, because the apps' tsconfigs include `@stores`, so plain `.ts` app code (`main.ts`) can import it.
- `apps/pwa/src/appVersion.ts`: `resolveAppVersion(import.meta.env)`, which validates the build number and channel and provides safe fallbacks.
- `apps/pwa/vite.config.ts`: sets `VITE_APP_VERSION` from `package.json` before Vite loads env, so it wins over `.env`. Diagnostics (`useDiagnosticReporter`) now report the real version too.
- `packages/ui/src/views/AuthView.vue`: injects the version and renders the i18n-formatted label under the badge.
- i18n: `user.login.appVersion`, `appVersionBuild`, `appVersionWithChannel`, `appChannelDev`, `appChannelLocal` in en, pl and mx.

### Tests (follow-up)

| AC | Test |
|---|---|
| 6 | Live render check (headless Chromium: height 20, opacity 0.7). CSS in `AuthView.vue` |
| 7 | `AuthView.spec.ts` › app version under the badge › prod / dev / local cases |
| 8 | `AuthView.spec.ts` › uses the dark-ink style in dark mode and the white style in light mode |
| 9 | `apps/pwa/src/appVersion.spec.ts` › drops a missing, zero, negative or non-numeric build number |
| 10 | `AuthView.spec.ts` › renders nothing when the app provides no version |

### Follow-up 2: NEOSLEEP wordmark on the login page

Łukasz reviewed the result and asked for the login wordmark to follow the same scheme: **white in light mode, dark in dark mode**. Before this, it did the opposite, so it clashed with the badge and version under the card.

11. On `/login`, light mode shows the white wordmark (`logo_dark.svg`) and dark mode shows the dark-ink one (`logo_light.svg`, #4A4A49). Tenant overrides (`app_config.logo_dark_url` / `logo_url`) are swapped the same way.
12. The contrast halo behind the wordmark always contrasts with it. It's a soft deep-teal shadow (primaryDark #082A27 at 32%) in light mode and a white glow in dark mode.

This is scoped to `AuthChrome` (the login screen) only. `BrandLogo` keeps its normal mapping in the app header (`AppLogo`) and on the website, because those sit on plain light or dark surfaces where the standard mapping is correct.

Tests: `AuthView.spec.ts` › shows the white wordmark in light mode and the dark-ink one in dark mode, with the halo flipped to match. Also checked in a live headless-Chromium render of both themes.

### Known unrelated issue spotted while testing

With the OS "reduce motion" setting on, the login card and logo never appear. Only the orbs and the badge render, because `AuthView`'s `onMounted` reduced-motion branch skips `authCardRef.playEnter()` / `authChromeRef.playEnter()`. This existed before this change and is not fixed here. It needs its own ticket.

## Platform vs tenant

Platform-generic. The badge is a shared brand asset, not tenant config.
