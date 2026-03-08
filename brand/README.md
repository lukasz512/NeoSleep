# NeoSleep brand assets

**Single source of truth** for logos, fonts, and brand visuals. Use this folder for all applications (website, rep-app, portal, etc.).

## Source

Brand definition and assets come from **NeoSleep.pdf** (brandbook). Extract logos and reference fonts from the PDF and place them here.

## Folder structure

```
brand/
  README.md          (this file)
  logos/             Logo files – single source for all apps (white-label). Only 4 files:
    icon_light.svg   Icon: teal + white. Use on dark backgrounds (dark theme). Manifest/PWA/favicon.
    icon_dark.svg    Icon: teal + grey. Use on light backgrounds (light theme). Manifest/PWA/favicon.
    logo_light.svg   Full logo (icon + wordmark) for light theme. Header, sidebar.
    logo_dark.svg    Full logo (icon + wordmark) for dark theme. Header, sidebar.
  fonts/             Optional: custom font files if specified in brandbook
```

## Usage

- **Header / sidebar:** Use `logo_light.svg` when UI is light, `logo_dark.svg` when UI is dark. Apps switch `src` by theme.
- **manifest.json (PWA, iPhone, Android):** Reference both `icon_light.svg` and `icon_dark.svg`. Where supported (e.g. `media` with `prefers-color-scheme`), the system can pick the icon by theme; otherwise the app can set one default and optionally swap at runtime. Generate PNGs (e.g. 192×192, 512×512) from these SVGs for manifest `icons` if the platform requires PNG.
- **Favicon:** Same as icon – use `icon_dark.svg` for light browser chrome, `icon_light.svg` for dark; or switch dynamically by theme.

## Usage in apps

- **Website** (`apps/website`): Copy or symlink `brand/logos/` into `apps/website/public/brand/logos/`. Use `logo_light.svg` / `logo_dark.svg` in layout by theme; use `icon_light.svg` / `icon_dark.svg` in manifest and favicon.
- **Rep-app** (`apps/rep-app`): Same – ensure `public/brand/logos/` contains the four files. Use `logo_light` / `logo_dark` in sidebar/drawer by theme.

To keep one global place and avoid duplication, you can:

1. **Copy on build**: Add a script or build step that copies `brand/logos/*` into each app’s `public/brand/logos/`.
2. **Symlink in dev**: In each app’s `public/`, add a symlink `brand` → `../../../brand` (repo root). Vite and other servers typically follow symlinks.

## Colors

Brand **primary** and **secondary** colours are not stored as image files here; they are defined in:

- **Database**: `tbl_app_config` (see `services/bff/migrations/015_app_config.sql`) holds `primary_color`, `secondary_color`, `border_radius`, etc., shared across website and rep-app.
- **Fallback in code**: Until the app loads config from the BFF, rep-app uses `apps/rep-app/src/assets/scss/_brand-colors.scss` and website uses `apps/website/src/assets/website-theme.scss`. The colour in the logo (green) is the **secondary** brand colour; the **primary** is to be set in the brandbook and in `tbl_app_config`.

See **foundation/docs/BRAND_AND_APP_CONFIG.md** for how app config and theme are wired.
