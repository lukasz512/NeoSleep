# NeoSleep brand assets

**Single source of truth** for logos, fonts, and brand visuals. Use this folder for all applications (website, rep-app, portal, etc.).

## Source

Brand definition and assets come from **NeoSleep.pdf** (brandbook). Extract logos and reference fonts from the PDF and place them here.

## Folder structure

```
brand/
  README.md          (this file)
  logos/             Logo files (SVG, PNG) from the brandbook
    logo.svg         Primary logo (recommended)
    logo.png         Fallback / raster
    logo-icon.svg    Icon-only or mark, if separate
  fonts/             Optional: custom font files if specified in brandbook
```

## Usage in apps

- **Website** (`apps/website`): Reference logos from the app’s public layer. Copy or symlink `brand/logos/*` into `apps/website/public/brand/logos/` so they are served at `/brand/logos/...`, or configure the build to include this folder.
- **Rep-app** (`apps/rep-app`): Same idea – ensure `public/brand/` (or equivalent) contains the logo assets so the app can use them (e.g. `/brand/logos/logo.svg`).

To keep one global place and avoid duplication, you can:

1. **Copy on build**: Add a script or build step that copies `brand/logos/*` into each app’s `public/brand/logos/`.
2. **Symlink in dev**: In each app’s `public/`, add a symlink `brand` → `../../../brand` (repo root). Vite and other servers typically follow symlinks.

## Colors

Brand **primary** and **secondary** colours are not stored as image files here; they are defined in:

- **Database**: `tbl_app_config` (see `services/bff/migrations/015_app_config.sql`) holds `primary_color`, `secondary_color`, `border_radius`, etc., shared across website and rep-app.
- **Fallback in code**: Until the app loads config from the BFF, rep-app uses `apps/rep-app/src/assets/scss/_brand-colors.scss` and website uses `apps/website/src/assets/website-theme.scss`. The colour in the logo (green) is the **secondary** brand colour; the **primary** is to be set in the brandbook and in `tbl_app_config`.

See **foundation/docs/BRAND_AND_APP_CONFIG.md** for how app config and theme are wired.
