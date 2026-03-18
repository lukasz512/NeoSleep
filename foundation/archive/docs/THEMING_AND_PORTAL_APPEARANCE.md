# Theming and portal appearance (admin-driven)

**Goal:** What is now in rep-app is the **core** (shared logic, components, patterns). **Rep app** and **portal** hold the **views** (screens and flows). Appearance (colors, logo, etc.) for a given client – especially the **portal** – is configurable by **admin only**. The portal will have the **color** (and other branding) that the admin sets (e.g. in Directus or a future admin “theme” UI).

## Architecture: core vs rep vs portal

- **Core:** Shared app shell, auth, API client (bffFetch), notifications, layout patterns. Lives conceptually in the monorepo as shared code or as the base that rep-app and portal extend.
- **Rep app:** Holds **rep views** (leads, HCP/HCO, dashboard, etc.). Uses core + rep-specific routes and components.
- **Portal:** Holds **portal views** for the HCP (or client): e.g. dashboard, documents/agreements, profile. Uses core + portal-specific routes and components. **Appearance** (primary color, logo, background) is driven by **admin configuration**, not hardcoded.

So: rep and portal are “view holders”; core is the common base. Later we may extract core into a shared package or keep it as the rep-app codebase that portal duplicates and adapts.

## Where appearance comes from

- **Directus** (or a dedicated admin UI) can store **theme/appearance** settings: e.g. **Project Color** (primary/brand color), **Project Logo**, **Public Foreground/Background** images, **Favicon**, and (if we add it) **Default Appearance** (light/dark/auto). See Directus **Settings → Appearance** (Branding & Theming Defaults).
- **Admin only:** Only users with **admin** (or a dedicated “appearance” role) can edit how the application looks for a given client. Rep and portal users do not see or change these settings.
- **Portal:** The portal app reads these variables (e.g. from BFF, which reads from Directus or from our DB that syncs with Directus). The portal then applies: **primary color** = admin-set project color; logo, favicon, and optional background/foreground as configured. So “portal będzie miał taki kolor jak ustawi admin” – the portal’s color is whatever the admin sets.

## Implementation (planned)

- **Storage:** Either (1) use **Directus** as source of truth (e.g. a “Settings” or “Theme” collection with project color, logo URL, etc.), and BFF exposes e.g. `GET /api/settings/appearance` that the portal calls, or (2) a small **tbl_appearance** (or similar) in our DB, editable in Directus, and BFF serves it. Same idea: admin edits in one place; portal (and optionally rep) consume.
- **Portal:** On load, portal fetches appearance settings and applies them (CSS variables for color, link for logo/favicon). No UI in portal for changing these; only admin in Directus (or future admin “theme changer”) can edit.
- **Rep app:** Can use the same mechanism later if we want per-client branding for rep (e.g. different colors per tenant). For now, rep can keep a single default theme; portal is the one that “will have the color the admin sets.”

## Summary

- **Core** = shared base; **rep** and **portal** = view layers.
- **Admin only** can edit how the app looks for a given client (Directus Settings → Appearance or our DB/Directus-driven settings).
- **Portal** gets its **color** (and logo, etc.) from admin configuration; “portal będzie miał taki kolor jak ustawi admin.”
- **Rep** can later use the same theme source if we need per-client rep branding.

## Relation to other docs

- **DIRECTUS_AS_ADMIN.md:** Directus as admin panel; appearance/branding can live there.
- **LEADS_AND_PARTNERS.md:** Portal holds HCP views (e.g. agreements/documents); portal appearance is admin-set.
- **DESIGN_AND_UI.md:** Design tokens (e.g. `--rep-radius`); theme/appearance from admin can override or supply primary color and assets.
