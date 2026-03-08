# PROJECT STATE – Neo Sleep Care

Last updated: 2026-02-23

---

## ✅ DONE
- **Marketing website:** Landing content (hero, stats, solutions, for dentists/patients, CTA); green theme; CSS variables for future config. See **foundation/docs/WEBSITE_MODULE.md**.
- **Lockfile and install enforcement:** Docs (DEPENDENCY_AND_LOCKFILE.md), root script `lockfile:check`, pre-commit hook. Single lockfile rule documented in WORKSTATION.
- **Delivery orchestrator:** TASK_BOARD.md and DELIVERY_AND_QA.md with handoff process and QA checklist; linked from WORKSTATION.
- Foundation pack created
- Repo skeleton initialized
- Architecture Bible defined
- Core ADRs created (BFF boundary, separate portal)
- Basic views (app shell) for admin, rep-app, portal, website (SPEC-0041): router, layouts, placeholder views, i18n
- **Stage 0 – Engineering Foundation (SPEC-0010):** CI gates (lint, typecheck, test), `passWithNoTests: false` in all workspaces, BFF /health test, PR template with checklist
- **Rep-app – UX (SPEC-0042, mobile first):**
  - **Mobile first:** touch targets min. 44×44 px, safe area, sidebar toggle **at bottom** (thumb zone).
  - Sidebar for **modules** only (navigation); collapsible, state in `localStorage` under `rep-app-settings`, collapsed = icon-only links. **Theme and language** in user menu on the right (avatar + name, dropdown).
  - Light/dark theme: one button (sun/moon). Languages PL/EN/ES: dropdown with flags. All settings (theme, locale, sidebar) stored under single key `rep-app-settings`.
  - i18n: `i18n/en.json`, `pl.json`, `es.json` (full rep-app key set). **Default and fallback locale: English (EN)**; i18n keys in English, `en.json` is source of truth (auto-translate).
  - **Tests:** `constants.spec.ts`, `utils/theme.spec.ts`, `utils/sidebar.spec.ts` (parseSidebarCollapsed), `i18n-rep-keys.spec.ts`, router (`App.spec.ts`).
  - **Mobile layout symmetry:** On viewports &lt; 768px, header and content use **symmetric horizontal padding (16px left and right)** so the title and content are not flush to the edges.
- **Rep-app – shared foundation for admin / client / portal:**
  - **Vuetify throughout:** Layout controls (hamburger, sidebar toggle, header user trigger, mobile drawer user trigger) use **VBtn**; views use Vuetify components (VTextField, VSelect, VCard, VBtn, etc.). Rep-app is the reference; admin/portal/website will have app-specific views but same patterns.
  - **Global notification hub:** `useNotifications()` composable + `AppNotificationHub.vue` (VSnackbar). Mounted in `App.vue`; use `show(message, type)` from any component. i18n key `notification.dismiss`. **Desktop:** bottom-right, arrow right, swipe right to dismiss. **Mobile (&lt; 768px):** top-center, arrow up, pull-up (swipe up) to dismiss.
  - **Loading blocks all buttons:** When global loader is active, a full-area overlay on the main content blocks all clicks (cursor: wait). Overlay is in `AppLayout`; tests in `AppLayout.spec.ts`.
  - **Workstation:** `foundation/docs/WORKSTATION.md` – how to run, spec order, current focus, package versions, GitHub/CI. **Data & API:** `foundation/docs/DATA_AND_API.md` – BFF-only API, own PostgreSQL (Neon/Supabase/Railway/Cloud SQL), Zod on BFF, Vuetify/VeeValidate on frontend, Make.com for automation (no DB in Make).
- **Deployment & environments:** `foundation/docs/DEPLOYMENT.md` – production and UAT; rep, portal, website as apps; **admin = Directus** (see DIRECTUS_AS_ADMIN.md); root scripts for website, rep-app, portal (no admin app build).
- **Automation & compliance:** `foundation/docs/AUTOMATION_AND_COMPLIANCE.md` – minimal Make.com; optional Notion; leads→HCP/HCO flow; inactive + anonymization for compliance; users/roles in DB, auth delegated to provider.
- **Observability:** `foundation/docs/OBSERVABILITY_AND_LOGGING.md` – audit log, Sentry (no remote console), optional AI-assisted fixes from error webhooks.
- **Local DB first:** `foundation/docs/LOCAL_DATABASE.md` – run Postgres locally (Docker or native), then host (Neon/Supabase); DATA_AND_API updated with users/roles and local-first.
- **Rep-app auth guard:** Outside dev mode, only logged-in users see the app; unauthenticated users see only the login screen. Pinia store `useAuthStore`; router `beforeEach` redirects to `/login` when `requiresAuth` and not authenticated, and redirects to `/dashboard` when on `/login` and authenticated. In dev, full access and dev “Login as” + “Go to app” set authenticated for testing.
- **Design & UI:** `foundation/docs/DESIGN_AND_UI.md` – options for a more "future" look (design upgrade on Vuetify vs PrimeVue vs headless). First design pass in rep-app: DM Sans font, `--rep-radius` / `--rep-shadow-*` tokens in `theme.scss`; use them on cards and custom blocks.
- **Users and roles:** `tbl_users` (migration 004) with three roles: **admin**, **manager**, **rep**. Google login creates/gets user; session includes `user.role`. See **foundation/docs/USERS_AND_ROLES.md**. Permissions: BFF can read `req.session.user?.role`; frontend uses `auth.user?.role` for UI; requireRole middleware and region filtering planned.
- **Global API error handling:** BFF has error middleware (log + write to tbl_console_errors when ENABLE_CONSOLE_LOG_DB=1 or prod). Rep-app uses **bffFetch** (composable useBffApi) for all BFF calls: on failure, show notification and POST /api/logs so errors appear in **tbl_console_errors**. See **foundation/docs/OBSERVABILITY_AND_LOGGING.md** and **CONSOLE_LOGS_AND_SELF_HEALING.md**.
- **Logging to DB in dev:** **ENABLE_CONSOLE_LOG_DB=1** in `services/bff/.env` so BFF and frontend API errors are persisted; view in Directus (tbl_console_errors).
- **Shared filters module:** One composable (`useRepFilters`) and one component (`RepFilterBar`) for list views; badge with active filter count, clear button, persistence per rep in localStorage (Leads and HCP use it). See **foundation/docs/FILTERS_MODULE.md**.
- **Planner events (SPEC-0043):** BFF events API (GET, POST, PATCH), EventForm (VDialog with title, dates, status, HCO/HCP multi-select), PlannerView wired to fetch events and open form on date/event click. Status: planned/done/rejected/no-show. See **foundation/docs/PLANNER_AND_EVENTS.md**.

---

## 🚧 IN PROGRESS
- (none – next: Stage 1)

---

## ⏭ NEXT
1. Implement SPEC-0002 (Google OIDC) – no Google Workspace required; any Gmail can sign in. See **foundation/docs/COST_AND_NEXT_STEPS.md** for Workspace vs OAuth and cheap hosting (Hetzner VPS).
2. Implement SPEC-0003 (Notion Adapter)

---

## 📋 PLANNED / BACKLOG
- **Samples module:** Sample warehouse + handout to HCP with signed acceptance form; later email confirmation to HCP. See **foundation/docs/SAMPLES_MODULE.md**.
- **Admin = Directus:** Admin panel is Directus (self-hosted), not the Vue app in apps/admin. See **foundation/docs/DIRECTUS_AS_ADMIN.md**. Open questions: URL, production hosting (VPS), repo cleanup of apps/admin.
- **Lead → partner flow:** When lead agrees to partner: convert to HCP/HCO (tbl_hcp, tbl_hco); sign agreement (method TBD; e-sign on tablet or link). Signed document visible to HCP in portal. **Portal tab “Contracts / Documents”** planned. **MX (Mexico) compliance:** e-signature valid if attributable, conserved, original kept; simple e-sign (e.g. tablet) acceptable. See **foundation/docs/LEADS_AND_PARTNERS.md**.
- **Theming / portal appearance:** Rep-app = **core**; rep and portal hold **views** (views per app; layout, composables, components, BFF global). **Admin only** can edit how the app looks per client. **Portal** gets **color** (and logo, etc.) from Directus Settings → Appearance (or our DB). See **foundation/docs/THEMING_AND_PORTAL_APPEARANCE.md** and **ARCHITECTURE_BIBLE.md** (§3 two apps).
- **Video calls module:** In-app video calls (rep ↔ HCP). Options: Jitsi (self-hosted, no per-user fee), Daily.co (free tier), or others. See **foundation/docs/COST_AND_NEXT_STEPS.md**.
- **Recording + auto meeting notes:** Record calls → transcribe (e.g. Whisper, AssemblyAI) → LLM summary. Pipeline and cost options in **foundation/docs/COST_AND_NEXT_STEPS.md**.

---

## 🚫 BLOCKED
- None yet

---

## 🎯 CURRENT FOCUS
Stage 1 – Secure Core (SPEC-0002 Google OIDC)

---

## 📌 RULES
- Every feature starts with a SPEC.
- Architecture changes require ADR.
- PR must include tests + docs update.
- No secrets in frontend.
- RBAC enforced server-side.
- EN is default and fallback locale; i18n keys are in English; en.json is source-of-truth (auto-translate).
- Tenant config drives UI behavior.

---

## 🧠 HOW AI SHOULD USE THIS FILE
When asked:
- “What next?” → look at NEXT section.
- “What is current status?” → summarize DONE + IN PROGRESS.
- “Can we move to next stage?” → verify DoD of current stage in EXECUTION_MAP.md.
- “How do I start working on specs?” → use foundation/docs/WORKSTATION.md and SPECS_INDEX.

AI must update this file after:
- Stage completion
- Major architecture decision
- Milestone change
