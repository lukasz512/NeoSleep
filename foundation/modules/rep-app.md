# Module: Rep App (PWA)

Type: App  
Depends on: services/bff, packages/config

## Purpose
Rep-facing PWA for B2B: leads/HCP/HCO, presentations, meetings, post-call forms, offline meeting mode.

## Mobile first (SPEC-0042)
- App is designed **mobile first**: touch targets min. 44×44 px, safe area (notch/home indicator).
- **Sidebar** has a **logo area at the top** (full icon + "NeoSleep" when expanded, icon-only when collapsed). Below it: **modules** only (Dashboard, Contacts, Accounts, Planner). iOS/Finder-like style: section heading (“Modules”), icon + text per link, rounded corners, dark panel in dark mode. Collapsible; collapse toggle **at bottom** (thumb zone). State in `localStorage` under `rep-app-settings`. Sidebar footer padding `max(20px, safe-area)` so the button is not cut off (dock).
- **Header (above separator line):** on the left **current module title** (Dashboard, Contacts, …), on the right **user info** (avatar, name, **role label** e.g. Sales Rep; source TBD – API/config later). Click on user info → dropdown (theme, language). **Menu closes on language change** (key behavior).
- **Shared components:** HCP app will be similar; plan for later extraction of shared components (sidebar, user menu).
- **Separator line under title:** full width of header (header::after, left/right 16px), aligned with title and content. Module title vertically centered in header (align-items: center).
- **Global loader:** When any API request (or other global loading state) is active, a thin animated bar is shown in the same position as the header separator (same horizontal inset, `--rep-content-padding-x`). The bar reuses the same visual language (1px-like line, 2px height for visibility) and animates in the app primary color (`--rep-primary`). Implemented via the `useGlobalLoader` composable: call `startLoading()` when a request starts and `stopLoading()` when it ends; multiple concurrent requests are supported (counter-based). The loader is accessible (role="status", aria-live="polite", i18n label).
- **Notifications (AppNotificationHub):** Desktop: bottom-right, arrow right, swipe right to dismiss. **Mobile (&lt; 768px):** top-center, arrow up, pull-up (swipe up) to dismiss. Uses `useDisplay` with `MOBILE_BREAKPOINT` for responsive behavior.
- **Mobile / iPad mini (SPEC-0042):** sidebar collapses into **hamburger at bottom**; on tap – drawer from bottom with animation, **max-height: 70vh** (sliver of page visible behind), overlay closes menu; menu closes on module selection. i18n: default and fallback locale = EN, keys in English.
- **Mobile symmetry:** On viewports &lt; 768px, header and content use **symmetric horizontal padding (16px left and right)** so title and content are not flush to edges and remain readable.

## View transitions and animations
- **View transitions:** RouterView in AppLayout uses Vue `Transition` with `view-fade-lift`: fade + slight vertical lift (enter from below, leave upward). Physics-inspired easing (`cubic-bezier(0.22, 1, 0.36, 1)`), 280ms.
- **List stagger:** RepEntityList feed (mobile cards) uses `TransitionGroup` with `list-stagger`: cards enter with 40ms delay per item; leave animates upward. Same easing as view transitions.
- **Theme tokens:** `theme.scss` defines `$rep-ease-out-smooth`, `$rep-ease-spring`, `$rep-transition-duration` for consistent animations across the app.

## Styling: SCSS only, Vuetify base
- **All styles use SCSS** (no plain CSS). Global tokens: `src/assets/theme.scss` (CSS custom properties for colors, layout, and button touch targets). Tables use Vuetify only (no legacy rep-table).
- **Vuetify** is the base; customize lightly (props, theme, scoped overrides). Keep views small and readable; prefer reusable components (RepDataTable, PageSection).
- **Buttons:** Desktop – default or slightly larger (e.g. min 40px). **Mobile/tablet (&lt; 768px)** – **min 44×44 px** touch targets for easy tap. `theme.scss` defines `--rep-btn-min-height` / `--rep-btn-min-width` and sets them to 44px in a mobile media query. Use these variables or ensure v-btn / custom buttons meet the minimum; tests assert touch targets on mobile.

## Layout, symmetry and styling (all views)
- **Total symmetry:** Layout uses symmetric horizontal padding and spacing everywhere. Use the same horizontal inset for header, content, and (on mobile) drawer: `--rep-content-padding-x` (default 16px). Separator line, title, and content share the same left/right insets. Keep this rule for any new panels or modals.
- **Logo and header row:** The sidebar logo block and the main header (module title + user avatar) share the same vertical height (`--rep-topbar-height`, default 56px) so that the **separator line under the logo** and the **separator line under the page title** meet on one horizontal line. The logo is vertically centered in that row with the title and avatar.
- **Mobile: left alignment everywhere:** On viewports &lt; 768px, header title, content area, and drawer content all use the same left padding (`--rep-content-padding-x`). Everything is left-aligned; do not add extra margins or padding that would break the alignment. Header separator and content start at the same horizontal position.
- **New views inherit styles automatically:** Views rendered inside `AppLayout` (e.g. under `.layout-app__content`) receive the same content padding and typography. Do not add extra outer padding or margins to new view roots; use the existing content area so new views immediately match the project look. Use CSS variables from `theme.scss` (e.g. `--rep-text`, `--rep-bg`, `--rep-border`) for colors so light/dark and future theming stay consistent.

## UI stack: Vuetify and theme
- **Vuetify 3** is the main UI library. The app is wrapped in `<v-app>` (in `App.vue`). Plugin: `src/plugins/vuetify.ts` with themes `repLight` / `repDark` aligned with `theme.css` (primary `#1976d2` / `#42a5f5`). Theme toggling in the layout syncs both `data-theme` and Vuetify’s theme (e.g. `useTheme().global.name`).
- Prefer **Vuetify components** (e.g. `v-data-table`, `v-text-field`, `v-btn`) for robust, accessible UI. Use `vite-plugin-vuetify` with `autoImport: true` so components are available without explicit imports.
- **Reusable components** (in `src/components/`): **RepDataTable** – desktop table + mobile cards, use for HCP, HCO and other list views; **PageSection** – card with title and optional subtitle for simple pages (Dashboard, HCO placeholder). Names are app-neutral for future reuse in client, portal, admin. All UI labels use i18n with **English as default** (`fallbackLocale: "en"`, keys in `en.json`).

## Tables (HCP, HCO, and list views)
- **Desktop:** Prefer **Vuetify `v-data-table`** for list/table views (e.g. HCP view). Use `:headers`, `:items`, `item-value`, and hide footer with `<template #bottom></template>` if no pagination is needed. Theme and hover come from Vuetify.
- **Tables:** Use Vuetify `v-data-table` (e.g. via `RepDataTable`). Theme variables in `theme.scss` (`--rep-table-*`) remain for any custom overrides; no native `<table class="rep-table">` in the app.
- **Mobile (&lt; 768px):** HCP uses a feed of cards instead of the table; keep the same data and filters.
- **Consistency:** All list views should share the same row height / padding and respect light/dark theme.

## Settings (per user / instance)
- **Unified key:** All rep-app settings live under one localStorage key (`rep-app-settings`). API: `getRepSettings()` / `setRepSettings(partial)` in `utils/rep-settings.ts`. Types: `RepAppSettings`, `HcpFilters`. Persisted: theme, locale, sidebarCollapsed, filters (e.g. HCP specialty, institution, region).

## Public interfaces
- Routes: /dashboard, /hcp (Contacts), /hco (Accounts), /planner, /presentations, /meeting/:id, /content, /settings. Route list is in `router/routes.ts`; `router/index.ts` creates the router with `createWebHistory`.
- **HCP (Contacts):** search, filters (specialty, institution, region) in a popover, and **v-data-table** (desktop) or card feed (mobile). Mock data in `views/hcp-mock-data.ts`; replace with API when ready.
- **Planner:** Calendar view (month/week/day) for planning meetings with doctors. Event types: F2F, Video. Multi-attendee support (HCP/Lead). Email outreach is tracked in `tbl_communication_log` (post-sale reporting), not in planner. See SPEC-0043.
- Presentations: placeholder for now; later expansion (e.g. filter by product, products vs presentations TBD).
- Offline queue + sync indicators

## Key flows
- Start meeting -> show content -> capture context -> PCF -> sync
- Search leads/HCP/HCO (cached subset)

## Configuration
- tenant-config: branding, default language, features, PCF schema, content sources

## Testing (current in repo)
- **Environment:** Vitest with `environment: "node"`. For Node &lt; 19, tests use `NODE_OPTIONS='--require=./vitest-crypto-polyfill.cjs'` (polyfills `crypto.getRandomValues` and `crypto.hash` for Vite/Vue). `src/test-setup.ts` stubs `window` / `navigator` / `location` where needed.
- **Specs:** `App.spec.ts` – router (login, dashboard, redirect) using `router/routes.ts` and `createMemoryHistory` so no browser APIs are required. `AppLayout.spec.ts` – layout structure, view transitions (view-fade-lift), CSS/SCSS (readFileSync on `AppLayout.vue` and `theme.scss`); **touch targets**: sidebar toggle and mobile controls assert min 44px; theme.scss asserts mobile media query for `--rep-btn-min-height` / `--rep-btn-min-width` 44px. `AppNotificationHub.spec.ts` – notification hub structure, mobile vs desktop (location, arrow, touch handlers). `RepEntityList.spec.ts` – list-stagger transition on feed. `utils/rep-settings.spec.ts` – getRepSettings/setRepSettings, merge (localStorage mocked in node). `constants.spec.ts` – REP_STORAGE_KEYS including `settings`. `utils/theme.spec.ts`, `utils/sidebar.spec.ts`, `composables/useGlobalLoader.spec.ts`, `i18n-rep-keys.spec.ts` – as before.
- E2E: Playwright (planned, e.g. offline meeting scenario).

## Refactoring (planned)
- **File size:** Keep files under ~200–300 lines. Split large components (e.g. `AppLayout.vue`) into smaller subcomponents or composables.
- **UI consistency:** Prefer Vuetify components (e.g. `v-data-table`, `v-text-field`, `v-btn`, `v-menu`, `v-select`) and shared styles so the codebase stays robust and maintainable. Replace remaining custom form/table markup where it makes sense.

## Security
- Auth: Google Workspace OIDC (via BFF)
- Permissions: region scope enforced in BFF
