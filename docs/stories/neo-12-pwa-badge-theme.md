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

## Platform vs tenant

Platform-generic. The badge is a shared brand asset, not tenant config.
