# Brand and style assets (NeoSleep)

This folder is the **dedicated place for style-related assets** used by the rep-app.

## Contents

- **NeoSleep.pdf** – First design file with project colors and branding. Use it to align:
  - `apps/rep-app/src/assets/scss/_brand-colors.scss` – primary, primary-hover, accent (update hex values from the PDF).
  - Vuetify theme in `apps/rep-app/src/plugins/vuetify.ts` – keep primary colors in sync with `_brand-colors.scss`.
- **logo.svg** – App logo shown in sidebar and mobile drawer. Replace with the official NeoSleep logo from the project. The app uses it when `BRAND_LOGO_URL` in `src/constants.ts` points here (e.g. `/brand/logo.svg`).

## Updating colors from the PDF

1. Open **NeoSleep.pdf** and note the primary (and optional accent) hex values.
2. Edit **`apps/rep-app/src/assets/scss/_brand-colors.scss`** and set:
   - `$rep-brand-primary`
   - `$rep-brand-primary-hover`
   - `$rep-brand-primary-light` (for dark theme)
3. Optionally update **`apps/rep-app/src/plugins/vuetify.ts`** so Vuetify components use the same primary (light and dark theme).

## Adding a new logo

Replace **logo.svg** with your asset (SVG preferred for sharp scaling). Supported in sidebar and mobile drawer. To fall back to the inline icon only, set `BRAND_LOGO_URL` to `""` in `src/constants.ts`.
