# NeoSleep brand assets

## Logo

- **Wordmark:** "NEOSLEEP" – the "O" is a stylized icon (two crescent arcs forming a circle).
- **Icon (standalone):** The same "O" icon used for favicon, app icons, social.

### Logo usage by background

| Background   | Text/wordmark | Icon top arc | Icon bottom arc |
|-------------|----------------|--------------|------------------|
| White       | Charcoal (#474747) | Primary teal (#128F83) | Charcoal (#474747) |
| Dark grey   | White         | Primary teal (#128F83) | White |
| Teal       | White         | White        | White (full circle outline) |

### Files (shared repo – white-label)

Single source: [brand/logos/](../../../../brand/logos/) at repo root. Only four files:

- **icon_light.svg** – icon (teal + white). Dark backgrounds, PWA/manifest, favicon when dark.
- **icon_dark.svg** – icon (teal + grey). Light backgrounds, PWA/manifest, favicon when light.
- **logo_light.svg** – full logo (icon + wordmark) for light theme. Header, sidebar.
- **logo_dark.svg** – full logo (icon + wordmark) for dark theme. Header, footer, sidebar.

Apps copy or symlink into `public/brand/logos/` and use by theme.

## Color palette

See `colors.ts` and `website-theme.scss`. Summary:

| Token           | Hex       | Usage |
|-----------------|-----------|--------|
| Primary teal    | #128F83   | Buttons, CTAs, logo accent |
| Light teal      | #8ED6CE   | Backgrounds, highlights |
| Darker teal     | #10544E   | Hover, accents |
| Very dark teal  | #082A27   | Footer, dark sections |
| Charcoal dark   | #474747   | Text on light, logo on light |
| Charcoal medium | #555555   | Body text |

## References

- foundation/docs/WEBSITE_FRONTEND_BRIEF.md
- foundation/docs/BRAND_AND_APP_CONFIG.md
