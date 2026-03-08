# Architecture Bible

## 1) Goals
- White-label SaaS ("box") configurable per tenant
- Rep PWA for B2B sales (offline meeting mode)
- Future HCP/patient portal separated from rep app
- AI hub: Q&A, PCF auto-fill, monthly insights
- Strong quality bar: TDD, docs, CI gates

## 2) Non-goals (v1)
- Full offline for the entire app (v1: meeting/offline subset)
- Complex Canva embed tracking (v1: PDF player + tracking)

## 3) Apps & subdomains
- Website: `neosleepcare.com`
- Rep app: `rep.neosleepcare.com` (or `app.neosleepcare.com`)
- Admin: **Directus** (self-hosted), e.g. `admin.neosleepcare.com` – see DIRECTUS_AS_ADMIN.md. The Vue app in apps/admin is deprecated.
- Portal: `portal.neosleepcare.com` – later

### Two apps: rep and portal (views per app, rest global)
We build **two main frontend applications**: **rep** (`apps/rep-app`) and **portal** (`apps/portal`). Each has its own deployable bundle and subdomain. **Views and route sets are per app**: rep has rep-only views (leads, HCP, HCO, dashboard, planner, presentations); portal has portal-only views (e.g. dashboard, documents, profile). **Everything else is global/shared**: layout patterns (AppLayout, sidebar, header), composables (useBffApi, useRepFilters, useNotifications), reusable components (RepFilterBar, AppEmptyState), theme/SCSS tokens, BFF, and DB. Tests and docs must reflect this split: router/view specs are per app; shared behaviour is asserted in layout and component specs. See THEMING_AND_PORTAL_APPEARANCE.md (core vs rep/portal views).

## 4) Key architecture choices
- BFF for rep and portal; Directus for admin (connects to same Postgres as BFF).
- PostgreSQL as primary DB (local then hosted); Notion optional during transition. See DATA_AND_API.md, DIRECTUS_AS_ADMIN.md.
- i18n: extracted keys, auto-translate, per-tenant overrides
- Emails: transactional provider + MJML templates, localized
- Observability: Sentry + event log (minimal sensitive payload)

## 5) Security & sensitive data (PHI-like)
- Treat medical/patient data as sensitive by default
- Data minimization + redaction at logging boundaries
- No secrets in frontend; strict auth & scopes in BFF
- Region/role scoping enforced server-side

## 6) Multi-tenant model
- Tenant config is versioned + rollbackable
- Overrides for brand + i18n + email templates + AI prompts
- Per-tenant prompt registry and versioning (audit which version generated output)

## 7) Offline strategy (v1)
- Cache PDFs/assets for meetings
- IndexedDB queue for PCF submissions + slide events
- Retry sync when online; show clear state to rep

## 8) Data model (v1 summary)
- HCP ↔ HCO: many-to-many + default HCO
- Leads relate to HCP/HCO and pipeline stages
- Meeting binds Lead/HCP/HCO + captured context
- Presentation + SlideEvent for analytics

## 9) i18n strategy
- EN source-of-truth
- CI extraction + unused marking + prune after safety window
- Auto-translate via Make/OpenRouter PRs
- Translation UI: Tolgee self-host (phase 2)

## 10) Emails strategy
- Provider (Postmark/SendGrid/Mailgun)
- DNS: SPF/DKIM/DMARC
- MJML + Handlebars templates
- Tenant branding + localization

## 11) AI strategy
- OpenRouter models via BFF
- Workflows:
  - Rep Copilot Q&A (process/products)
  - Voice dictation -> transcript -> PCF suggestions
  - Monthly insights on reps' questions
- Prompt versioning per tenant, with audit

## 12) Styling (global)
- **SCSS only** for all styles (no plain CSS). See `foundation/docs/STYLING.md`.
- Vuetify as base; light customization. Buttons: desktop default/slightly larger; **mobile/tablet min 44×44 px** touch targets. Tests assert touch targets and theme variables.

## 13) Quality bar
- Unit tests: Vitest
- E2E: Playwright
- CI gates: tests required, lint, typecheck
- **Docs must be updated per PR** – every change to behaviour, UI, or API is documented immediately (specs, FILTERS_MODULE.md, PLANNER_AND_EVENTS.md, etc.). Do not defer documentation.

## 14) Documentation discipline
- **Document every change**: When implementing a feature, fixing a bug, or changing UI/API, update the relevant docs in the same change set (e.g. FILTERS_MODULE.md, PLANNER_AND_EVENTS.md, API_CONTRACT.md, PROJECT_STATE.md).
- **Automation**: Maximize automation of app behaviour; when errors appear, create tasks and fix what does not work.
