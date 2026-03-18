# Website module (marketing site)

**Purpose:** Public marketing website for Neo Sleep Care – sleep apnea solutions for patients and dentists. Served at neosleepcare.com (production) and uat.neosleepcare.com (UAT). See [DEPLOYMENT.md](DEPLOYMENT.md).

## Current structure

- **App:** [apps/website](../../apps/website) – Vue 3, Vue Router, vue-i18n. No BFF dependency for static content; can call BFF later for config.
- **Layout:** [DefaultLayout](../../apps/website/src/layouts/DefaultLayout.vue) – header with green logo icon + “NeoSleep”, main nav (Solutions, For Dentists, For Patients, About), “Get Started” CTA, main content, and footer (black, multi-column links). Logo and brand name are i18n-driven.
- **Home:** Single long landing page – hero (two-column: headline “Better Sleep.” / “Better Life.” + image on right), stats strip, Solutions (two cards with icons and checkmarks, light gray background), For Dentists (image left, 2×2 feature grid right), For Patients (content left, image right, feature list), final CTA (full-width green banner), then footer. Section images live in `apps/website/public/images/` (hero.jpeg, for-dentists.jpeg, for-patients.jpeg); replace these files to change imagery. Sections use ids `#solutions`, `#for-dentists`, `#for-patients`, `#cta` for anchor links.
- **Copy:** All visible strings are in [i18n/en.json](../../i18n/en.json) under `website.*` keys so content is editable and ready for future DB-backed config.
- **Theme:** [apps/website/src/assets/website-theme.scss](../../apps/website/src/assets/website-theme.scss) – CSS variables for green palette and layout. Used by layout and views.

## Theme variables

Defined in `website-theme.scss` and used across the site:

| Variable | Purpose |
|----------|---------|
| `--website-primary` | Main brand color (from brandbook; default until set). |
| `--website-primary-hover` | Hover for primary. |
| `--website-secondary` | Accent / logo color (green from NeoSleep logo). |
| `--website-secondary-hover` | Hover for secondary. |
| `--website-radius` | Border radius for buttons and cards. |
| `--website-font-sans` | Body/heading font stack. |
| `--website-bg`, `--website-text`, `--website-text-secondary`, `--website-border` | Background and text colors. |
| `--website-btn-min-height`, `--website-btn-min-width` | Minimum touch target size (44px) per styling rules. |

These can be driven from `tbl_app_config` via `GET /api/config/app` so the website and rep-app share the same theme. See [BRAND_AND_APP_CONFIG.md](BRAND_AND_APP_CONFIG.md).

## Future: configurable website

Planned (not yet implemented):

- **Menu:** 3–4 items stored in DB; admin edits label and URL. Layout reads from API or static config.
- **Theme:** Primary colour and border radius stored in DB (or Directus); same variable as native app. Website fetches on load and applies to CSS variables.
- **Content:** Section text (hero, stats, solutions, etc.) stored in DB; admin can edit in place (click-to-edit). Optional: font size or other typography later.

Tables and BFF endpoints for website config will be added when we implement the configurable flow. See [THEMING_AND_PORTAL_APPEARANCE.md](THEMING_AND_PORTAL_APPEARANCE.md) for shared theme/appearance strategy.

## Running the website

From repo root:

- **Dev:** `cd apps/website && pnpm dev` (or `npm run dev`). Vite port 5174. Or use `pnpm start` from repo root to run BFF + rep-app + website together.
- **Build:** `pnpm build:website` from root, or `pnpm run build` inside `apps/website`.

## Tests

- [apps/website/src/App.spec.ts](../../apps/website/src/App.spec.ts) – router (home, about, catch-all), DefaultLayout (header, logo, nav, main; nav links), HomeView (hero, stats, CTAs, section ids), theme variables on root.

## Related docs

- [WEBSITE_FRONTEND_BRIEF.md](WEBSITE_FRONTEND_BRIEF.md) – frontend brief for external implementation (Stich): structure general → patients/dentists, contact, chatbot, brand palette, Vue/TS/Vuetify/SCSS.
- [DEPLOYMENT.md](DEPLOYMENT.md) – domains and build commands.
- [THEMING_AND_PORTAL_APPEARANCE.md](THEMING_AND_PORTAL_APPEARANCE.md) – admin-driven appearance; portal and website can share primary colour source.
