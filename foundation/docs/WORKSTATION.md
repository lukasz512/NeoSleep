# Workstation – Ready for spec-driven work

This document prepares the repo for working through the specs. Use it as the entry point before picking tasks from SPECS_INDEX and EXECUTION_MAP.

## Prerequisites

- **Node.js** ≥ 20 (see root `package.json` / `.nvmrc` if present)
- **pnpm** 9.x or **npm** (use `npm run <script>` in each app; from repo root use `npm run <script> --workspaces --if-present` where needed)

## Commands (from repo root)

| Command | Description |
|--------|-------------|
| `pnpm start` | **One-command start**: Docker (Postgres, Adminer, Directus), nvm, migrations, BFF + rep-app + website. Use this to bring up the full dev stack. |
| `pnpm install` | Install dependencies for all workspaces |
| `pnpm ci` | Lint + typecheck + test (all workspaces); use before PR |
| `pnpm run lint` | Lint only |
| `pnpm run typecheck` | TypeScript check only |
| `pnpm run test` | Run unit tests (all workspaces) |
| `pnpm run test:e2e` | Playwright E2E (if configured) |
| `pnpm i18n:unused` | Detect unused i18n keys → `i18n/_unused.json` |
| `pnpm i18n:prune` | Dry-run: log what would be removed → `i18n/_prune-log.txt` |
| `pnpm i18n:prune --apply` | Remove unused keys from locale files (see I18N_SCRIPTS.md) |

## App-specific dev

From **repo root** (NeoSleep):

- **Quick start (recommended)**: `pnpm start` – starts Docker, runs migrations, and launches BFF + rep-app + website together.
- **Rep app**: `cd apps/rep-app && npm run dev` (Vite, port 5173)
- **Website**: `cd apps/website && npm run dev` (Vite, port 5174)
- **BFF**: `cd services/bff && npm run dev` (Express, port 3000)

**CORS in dev:** Rep-app uses a Vite proxy for `/api`, `/auth`, and `/health` → BFF (localhost:3000). Requests go through the same origin, so no CORS. Ensure both BFF and rep-app are running. **If you see CORS errors:** (1) Do not set `VITE_BFF_URL` in `apps/rep-app/.env` when using localhost or same-machine access – let the proxy handle it. (2) When accessing via LAN IP (e.g. 192.168.x.x:5173 or 169.254.x.x:5173), BFF CORS allows these origins in dev.
- **Admin / Portal / Website**: `cd apps/<app> && npm run dev`

If you use pnpm: same commands with `pnpm dev` instead of `npm run dev`. Make sure you run `cd` from the repo root so the path is correct.

## Testing on phone (same Wi‑Fi)

To open the rep-app on your phone while it runs on your machine:

1. **Get your machine’s LAN IP** (e.g. `192.168.31.198`):
   - macOS/Linux: `ifconfig | grep "inet "` (ignore 127.0.0.1; use the 192.168.x.x one)
   - Windows: `ipconfig`
2. **Rep-app** – in `apps/rep-app/.env` set (use **your** IP):
   ```env
   VITE_BFF_URL=http://192.168.31.198:3000
   ```
   From repo root: `cd apps/rep-app && npm run dev`. Vite listens on all interfaces.
3. **BFF** – in `services/bff/.env` set (use **your** IP):
   ```env
   FRONTEND_URL=http://localhost:5173,http://192.168.31.198:5173
   ```
   From repo root: `cd services/bff && npm run dev`.
4. On the **phone** (same Wi‑Fi), in the browser open: **http://192.168.31.198:5173** (replace with your IP from step 1).

If it doesn’t load, check the firewall (allow ports 5173 and 3000 for local network).

## Delivery and QA (task board)

- **Task board:** [foundation/docs/TASK_BOARD.md](foundation/docs/TASK_BOARD.md) – visible list (To do, In progress, Ready for QA, Accepted, Needs fix). Use it to see what is ready for your test and to move items when you accept or request fixes.
- **Process:** [foundation/docs/DELIVERY_AND_QA.md](foundation/docs/DELIVERY_AND_QA.md) – handoff steps, definition of "Ready for QA", and checklist for testing (website, rep app, etc.).

## Spec order and current focus

1. **Order**: Follow `foundation/specs/SPECS_INDEX.md` (phases 1 → 10). Within a phase, implement by SPEC number.
2. **Execution map**: See `foundation/docs/EXECUTION_MAP.md` for stage DoD and week-level plan.
3. **Current focus**: See `foundation/docs/PROJECT_STATE.md` (NEXT / CURRENT FOCUS).

Recommended start: **Stage 1 – Secure Core** (SPEC-0002 Google OIDC, then BFF minimal ready if not done).

## Repo layout (shared foundation)

- **Two apps:** **rep** (`apps/rep-app`) and **portal** (`apps/portal`). Views and routes are **per app**; layout, composables, components, theme, BFF, and DB are **global/shared**. See ARCHITECTURE_BIBLE.md (§3) and THEMING_AND_PORTAL_APPEARANCE.md.
- **apps/rep-app**: Reference app shell (layout, sidebar, loader, notifications, Vuetify). Patterns here are reused conceptually in portal; each app has its own views and routes.
- **services/bff**: Single API for all frontends. All frontends call BFF; no direct DB from frontend.
- **foundation/specs**: Source of truth for features; every feature starts with a SPEC.
- **foundation/docs**: Architecture, styling, runbooks, ADRs. See also **ACCESSIBILITY.md** for skip link, keyboard, and screen reader behaviour.

## Quality gates

- CI runs on PR and push to `main` (see `.github/workflows/ci.yml`).
- `passWithNoTests: false` in workspaces: CI fails if tests are missing or failing.
- PR template: use the checklist in `.github/PULL_REQUEST_TEMPLATE.md`.
- **Lockfile:** Do not commit `package.json` changes without running `pnpm install` and committing `pnpm-lock.yaml`. Optional: pre-commit runs `lockfile:check` to enforce this. See **foundation/docs/DEPENDENCY_AND_LOCKFILE.md**.

## Package versions

- Bump as needed; prefer compatible upgrades. Key stacks: Vue 3, Vuetify 3, Vite 7, Vitest 4, TypeScript 5.6, Node ≥ 20.
- After upgrading, run `pnpm ci` and fix any lint/type/test failures.

## GitHub and test environments

- **Adding repo to GitHub and keeping secrets safe:** See **foundation/docs/GITHUB_AND_SECRETS.md** – private repo setup, what never to commit, GitHub Actions secrets, and domains (neosleep.com / uat.neosleep.com on GoDaddy).
- Push to GitHub and protect `main`; require PR reviews and status checks.
- CI workflow already runs `pnpm ci`. Optional next steps:
  - Deploy previews (e.g. Vercel/Netlify for frontends) on PR.
  - Staging/prod environments: deploy BFF + frontends from `main`; use env-specific config (see SPEC-0034).

## Data, API, and validations (summary)

- **API**: BFF is the only backend API for rep, admin, and portal. Frontends never talk to the database directly.
- **Database**: Own PostgreSQL (see `foundation/docs/DATA_AND_API.md` for hosting options and migration path from Notion).
- **Validations**: BFF uses **Zod** (or similar) for request/response and env validation. Frontend forms use **Vuetify** rules and/or **VeeValidate**; keep validation rules in sync with BFF contracts where possible.
- **Automation**: Make.com (or similar) for workflows; BFF can expose webhooks for Make (SPEC-0018). Database hosting is independent (e.g. Neon, Supabase, Railway, or Google Cloud SQL).

For details on PostgreSQL, hosting, and validation strategy, see **foundation/docs/DATA_AND_API.md**. See also:
- **foundation/docs/GITHUB_AND_SECRETS.md** – adding the repo to a private GitHub repo; keeping keys/secrets out of the repo; neosleep.com and uat.neosleep.com (GoDaddy).
- **foundation/docs/DEPLOYMENT.md** – domains (neosleep.com, uat.neosleep.com on GoDaddy; rep/admin/portal subdomains), deploying all four apps (e.g. Vercel).
- **foundation/docs/LOCAL_DATABASE.md** – run Postgres locally first (Docker or native), then host when ready.
- **foundation/docs/DATABASE_MIGRATIONS.md** – how to run migration scripts to create/update tables (001_initial.sql and later).
- **foundation/docs/AUTOMATION_AND_COMPLIANCE.md** – Make/Notion, leads→HCP/HCO, compliance, users/roles.
- **foundation/docs/OBSERVABILITY_AND_LOGGING.md** – audit log, Sentry, optional AI-assisted fixes.
- **foundation/docs/DESIGN_AND_UI.md** – design system options and first "premium" pass (font, radius, shadows).
- **foundation/docs/SAMPLES_MODULE.md** – planned Samples module (warehouse, HCP signature form, email confirmation).
- **foundation/docs/DIRECTUS_AS_ADMIN.md** – admin panel = Directus (self-hosted); apps/admin deprecated; rep, portal, website unchanged.
- **foundation/docs/DIRECTUS_DEV_AND_DEPLOY.md** – dev stack in Docker (Postgres + Directus), expose Directus (tunnel), later deploy on Hetzner.
- **foundation/docs/CONSOLE_LOGS_AND_SELF_HEALING.md** – prod console logs to DB, recurrence detection, fix tasks, optional improvement plans.
- **foundation/docs/USERS_AND_ROLES.md** – tbl_users, three roles (admin, manager, rep), session.role, permissions next steps.
- **foundation/docs/LEADS_AND_PARTNERS.md** – tbl_leads, tbl_hco, tbl_hcp; lead → partner flow; agreements, MX e-sign compliance; portal Contracts/Documents tab (planned).
- **foundation/docs/THEMING_AND_PORTAL_APPEARANCE.md** – core vs rep/portal views; admin-only appearance; portal color from Directus/admin.
- **foundation/docs/DEPENDENCY_AND_LOCKFILE.md** – single lockfile; rule to commit lockfile with package changes; optional `lockfile:check` and pre-commit.
- **foundation/docs/TASK_BOARD.md** – delivery board (To do, In progress, Ready for QA, Accepted, Needs fix).
- **foundation/docs/DELIVERY_AND_QA.md** – handoff process and QA checklist.
- **foundation/docs/WEBSITE_MODULE.md** – marketing website (structure, theme variables, future configurable plan).
- **foundation/docs/BRAND_AND_APP_CONFIG.md** – brand folder (`brand/`), `tbl_app_config`, primary vs secondary color, `GET /api/config/app`.
