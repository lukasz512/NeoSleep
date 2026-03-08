# SPEC-0041: Basic views – app shell (admin, rep, portal, website)

Status: Draft  
Owner: Neo Sleep Care  
Milestone: Stage 0 / Foundation  
Apps/Modules: apps/admin, apps/rep-app, apps/portal, apps/website

## 1) Goal
Provide a minimal app shell (router, layouts, placeholder views) for all four frontends so each app has a clear structure for future features. No auth or BFF calls yet—scaffold only.

## 2) User story
As a developer (or AI), I want each app to have a router, at least one layout, and basic views (e.g. Home/Dashboard, Login placeholder), so I can add real features on a consistent structure.

## 3) UX flow
- **Website**: Home, About (marketing; no sidebar).
- **Admin**: Login (placeholder), Dashboard (tenant config / PCF builder placeholder).
- **Rep app**: Login (placeholder), Dashboard (meetings/leads placeholder).
- **Portal**: Login (placeholder), Dashboard (document access placeholder).

## 4) Data & API
- No API calls. Placeholder content only.

## 5) Events & analytics
- N/A for placeholders.

## 6) Edge cases
- 404 / unknown route → redirect to home or login as appropriate.
- All UI strings via i18n keys (REPO_CONVENTIONS).

## 7) Acceptance criteria
- Each app has `src/router/index.ts` with routes and optional `meta.layout`.
- Each app has at least `DefaultLayout` and (where applicable) `AppLayout` with sidebar placeholder.
- Views live under `src/views/`; layouts under `src/layouts/`.
- `App.vue` renders layout dynamically from route meta and contains `<router-view />`.
- i18n keys used for all user-visible text; keys added to `i18n/en.json`.
- Existing unit tests still pass; new view/layout components covered by at least one test per app.

## 8) Test plan
- Unit: router exists and has expected routes; default route redirects or shows expected component.
- Unit: App.vue renders layout and router-view (shallow or mount).
- E2E: optional later (navigate to / and /dashboard or equivalent).

## 9) Documentation updates
- `docs/RUNBOOK_LOCAL_DEV.md`: no change (start commands unchanged).
- `foundation/docs/PROJECT_STATE.md`: add “Basic views (app shell) for admin, rep-app, portal, website” under DONE when complete.
- `foundation/specs/SPECS_INDEX.md`: add SPEC-0041.

## 10) Out of scope (this SPEC)
- Real auth (SPEC-0002).
- Vuetify/design system (SPEC-0012).
- BFF integration.
