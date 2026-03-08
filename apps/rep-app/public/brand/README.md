# Brand and style assets (NeoSleep)

This folder is the **dedicated place for style-related assets** used by the rep-app.

## Contents

- **NeoSleep.pdf** – First design file with project colors and branding. Use it to align:
  - `apps/rep-app/src/assets/scss/_brand-colors.scss` – primary, primary-hover, accent (update hex values from the PDF).
  - Vuetify theme in `apps/rep-app/src/plugins/vuetify.ts` – keep primary colors in sync with `_brand-colors.scss`.
- **logos/** – App logos (source of truth: repo root `brand/logos/`). Copy or symlink the four files:
  - `icon_light.svg`, `icon_dark.svg` – PWA/manifest icons.
  - `logo_light.svg`, `logo_dark.svg` – Full logo for sidebar and drawer. The app uses `BRAND_LOGO_LIGHT_URL` and `BRAND_LOGO_DARK_URL` in `src/constants.ts` and picks by theme.

## Updating colors from the PDF

1. Open **NeoSleep.pdf** and note the primary (and optional accent) hex values.
2. Edit **`apps/rep-app/src/assets/scss/_brand-colors.scss`** and set:
   - `$rep-brand-primary`
   - `$rep-brand-primary-hover`
   - `$rep-brand-primary-light` (for dark theme)
3. Optionally update **`apps/rep-app/src/plugins/vuetify.ts`** so Vuetify components use the same primary (light and dark theme).

## Adding a new logo

Use the shared assets in repo root **`brand/logos/`** (icon_light, icon_dark, logo_light, logo_dark). Copy or symlink into `public/brand/logos/`. To fall back to the inline icon only, set `BRAND_LOGO_LIGHT_URL` and `BRAND_LOGO_DARK_URL` to `""` in `src/constants.ts`.
