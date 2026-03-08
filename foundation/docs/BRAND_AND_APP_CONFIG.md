# Brand and app config

**Goal:** One place for brand assets (logos, fonts) and one place for app theme config (colors, border radius) shared by website and rep-app.

## Brand assets (logos, fonts)

- **Source of truth:** [brand/](../../brand/) at repo root. See [brand/README.md](../../brand/README.md).
- **Content:** Extract logos and optional fonts from **NeoSleep.pdf** (brandbook) and place them under `brand/logos/` and `brand/fonts/`.
- **Usage:** Apps (website, rep-app) reference these assets from a single global place. Options: copy `brand/` into each app’s `public/brand/` at build time, or use a symlink in development so both apps serve the same files.

## App config (colors, border radius)

- **Storage:** Table **`tbl_app_config`** (see [services/bff/migrations/015_app_config.sql](../../services/bff/migrations/015_app_config.sql), [016_app_config_theme.sql](../../services/bff/migrations/016_app_config_theme.sql), [017_app_config_dark_colors.sql](../../services/bff/migrations/017_app_config_dark_colors.sql)). One row holds:
  - **primary_color** – main brand color for light mode (to be set from brandbook; currently default blue).
  - **secondary_color** – accent color for light mode (e.g. green from the logo). Used for logo tint, secondary buttons, accents.
  - **primary_color_dark** – primary color when color scheme is dark (default e.g. `#42a5f5`).
  - **secondary_color_dark** – secondary color for dark mode (default e.g. `#66bb6a`).
  - **border_radius** – global radius (e.g. `8px`).
  - **logo_url** – optional URL or path to logo asset.
  - **surface_color**, **hero_container_style**, **color_scheme** – see migration 016.
- **API:** BFF exposes **`GET /api/config/app`** (public) returning `{ primary_color, secondary_color, border_radius, logo_url }`, and **`PATCH /api/config/app`** (admin only) to update these values. In development, PATCH is allowed without a BFF session so "Go to app" (client-only) login can save theme config. Website and rep-app can call GET on load and apply values to CSS variables so both apps share the same theme.
- **Admin UI:** The admin app has a **Brand settings** view (`/brand-settings`) where admins can edit primary color, secondary color, and border radius via color pickers and a form; changes are saved via `PATCH /api/config/app`. In development, the admin Vite dev server (port 5175) proxies `/api`, `/auth`, and `/health` to the BFF so requests work without CORS.
- **Rep-app theme panel (admin only):** When logged in as admin, the rep-app shows a **palette icon** in the header and a **Theme & style** entry in the user menu. The panel is a **VDialog** + **VCard** (same max-width 680 as the add-new-lead form). **Color scheme** (Light / Dark) is shown first as a pill toggle; then **Primary color** and **Secondary color** swatches are shown for the selected scheme only (light → primary_color/secondary_color; dark → primary_color_dark/secondary_color_dark). On save, the app uses the global notification (success) instead of inline message. Saving updates `tbl_app_config` via `PATCH /api/config/app`. After a successful PATCH, the app refetches config with `GET /api/config/app` and applies that result to the document and to the panel, so the UI always reflects what is stored in the DB. If the table has no row, the BFF upserts (INSERTs) one so the first save persists. Config is also loaded on app mount.
- **Fallback:** Until the BFF endpoint and DB are in use, apps use local SCSS/CSS:
  - Rep-app: [apps/rep-app/src/assets/scss/_brand-colors.scss](../../apps/rep-app/src/assets/scss/_brand-colors.scss) and [theme.scss](../../apps/rep-app/src/assets/theme.scss).
  - Website: [apps/website/src/assets/website-theme.scss](../../apps/website/src/assets/website-theme.scss). Both should eventually drive `--website-primary` / `--rep-primary` from the same config (primary vs secondary as in the brandbook).

## Primary vs secondary color

- **Primary** – main brand color from the brandbook. Used for primary buttons, key UI emphasis. Still to be defined in the PDF; stored in `tbl_app_config.primary_color`.
- **Secondary** – accent (e.g. the green used in the logo). Used for logo icon, secondary highlights, “Better Life.” text, etc. Stored in `tbl_app_config.secondary_color` and in code as the current green (`#2e7d32` on website, or from _brand-colors in rep-app when aligned).

When implementing the BFF endpoint and frontend config load, map:

- **primary_color** → `--rep-primary` / `--website-primary` (main CTAs, primary emphasis).
- **secondary_color** → `--rep-secondary` / `--website-secondary` (logo, accents, secondary elements).

## Summary

| What | Where | Used by |
|------|--------|--------|
| Logos, fonts | `brand/logos/`, `brand/fonts/` | Website, rep-app (via public or symlink) |
| Primary / secondary color, radius, logo URL | `tbl_app_config` → `GET /api/config/app` | Website, rep-app (CSS variables) |

See also [THEMING_AND_PORTAL_APPEARANCE.md](THEMING_AND_PORTAL_APPEARANCE.md) for admin-driven appearance and portal.
