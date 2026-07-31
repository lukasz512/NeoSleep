# NeoSleep brand assets

**Single source of truth** for logos, fonts, and brand visuals. Use this folder for all applications (website, rep app, and any future apps).

## Source

Brand definition and assets come from **NeoSleep.pdf** (brandbook). Extract logos and reference fonts from the PDF and place them here.

## Folder structure

```
brand/
  README.md          (this file)
  logos/
    icon/            Icon only – PWA, favicon, app icons
      icon_light.svg   Teal + white. Dark theme / dark backgrounds.
      icon_dark.svg    Teal + grey. Light theme / light backgrounds.
    logo/            Full logo (icon + wordmark) – header, sidebar
      logo_light.svg   For light theme.
      logo_dark.svg    For dark theme.
  fonts/             Optional: custom font files if specified in brandbook
```

## Usage

- **Header / sidebar:** Use `logo/logo_light.svg` when UI is light, `logo/logo_dark.svg` when UI is dark. Apps switch `src` by theme.
- **manifest.json (PWA, iPhone, Android):** Use `icon/icon_light.svg` and `icon/icon_dark.svg`. Where supported (e.g. `media` with `prefers-color-scheme`), the system can pick by theme; otherwise set one default. Generate PNGs (e.g. 192×192, 512×512) from these SVGs for manifest `icons` if the platform requires PNG.
- **Favicon:** Same as icon – use `icon/icon_dark.svg` for light browser chrome, `icon/icon_light.svg` for dark; or switch dynamically by theme.

## Usage in apps

**One place:** every file lives only in **`brand/`** (repo root). No copies or symlinks in individual apps.

- **Website** (`apps/web`): Vite serves `brand/` at `/brand` in dev, and copies it to `dist/brand` on `pnpm build`. There is no `brand` folder under `apps/web/public/`.
- **Rep app** (`apps/pwa`): Same approach — a plugin in `vite.config.ts` serves `brand/` at `/brand` and copies it to `dist/brand` on build. There is no `brand` folder under `apps/pwa/public/`.

## Colors

Brand **primary** and **secondary** colours are not stored as image files here; they are defined in:

- **Database**: `app_config` (tenant schema, created in `apps/api/migrations/001_tenant_schema.sql`) holds `primary_color`, `secondary_color`, `border_radius`, etc., shared across website and rep app.
- **Fallback in code**: Until the app loads config from the API server, the rep app uses `apps/pwa/src/assets/scss/_brand-colors.scss` and the website uses `apps/web/src/assets/website-theme.scss`. The colour in the logo (green) is the **secondary** brand colour; the **primary** is to be set in the brandbook and in `app_config`.
