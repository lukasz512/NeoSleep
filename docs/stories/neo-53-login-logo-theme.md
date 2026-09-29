# NEO-53 — Login page NEOSLEEP logo follows the badge's colour scheme

**Ticket:** NEO-53 (split out of NEO-12)
**Status:** implemented on `worktree-neo-53-login-logo-theme`

## Story

As anyone opening the PWA login page, I want the NEOSLEEP logo to use the same colour scheme as the PWA badge and the version under the card, so the page looks coherent.

## Background

NEO-12 made the badge (and, in PR #154, the app version line) white in light mode and dark in dark mode. The login page sits on a teal photo with a dot grid, not a plain surface, so white reads well in light mode there. The logo still did the opposite (dark in light mode, white in dark mode), and Łukasz flagged it as looking reversed. He asked for it as its own PR, separate from NEO-12.

## Acceptance criteria

1. Light mode on `/login`: white logo (`logo_dark.svg`), readable against the background.
2. Dark mode on `/login`: dark logo (`logo_light.svg`, #4A4A49), readable against the background.
3. Toggling the theme swaps the logo and the glow behind it right away, with no reload.
4. The app header logo (`AppLogo`) and the website (`apps/web`) are unchanged.

## Implementation

- `packages/ui/src/components/AuthChrome.vue` passes `:dark="theme !== 'dark'"` to `BrandLogo`. `BrandLogo`'s "dark" asset is the white logo, so this shows white in light mode. Tenant overrides (`app_config.logo_dark_url` / `logo_url`) follow the same inversion.
- The contrast glow behind the logo flips with it, so it always contrasts with the logo instead of matching it. It's a soft deep-teal shadow (`primaryDark` #082A27 at 32%) in light mode and a white glow in dark mode (`.auth-chrome__halo--dark-mode`). It's driven by the theme store, the same source as the logo, rather than `[data-theme]`.
- `BrandLogo` itself is unchanged. Its normal mapping is still correct for the app header and the website, which sit on plain light or dark surfaces.

## Tests

| AC | Test |
|---|---|
| 1–3 | `AuthView.spec.ts` › shows the white wordmark in light mode and the dark-ink one in dark mode, with the halo flipped to match |
| 1–2 (readability) | Live headless-Chromium render of `/login` in both themes (screenshots in the NEO-53 artifact) |
| 4 | No changes to `BrandLogo.vue`, `AppLogo.vue` or `apps/web` |

## Platform vs tenant

Platform-generic. This is login-page layout logic, and tenant logo overrides keep working.
