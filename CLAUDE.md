# NeoSleep — Claude Code Instructions

## Project Overview
pnpm monorepo: 2 Vue 3 + Vite apps + 1 Express BFF + PostgreSQL.
Sleep care SaaS for pharma sales reps visiting HCPs (Healthcare Professionals).

## Terminology
- **HCP** = Healthcare Professional (stomatolodzy, laryngolodzy, pneumonolodzy, lekarze rodzinni)
- **HCO** = Healthcare Organization (clinic, hospital, practice)
- **Rep** = Sales Representative (pharma field rep using the app)
- **PCF** = Post Call Form (form filled after each HCP visit)
- **Tenant** = white-label client (pharma company licensing the platform)

```
apps/app/         → Main PWA (sales rep CRM, mobile-first)
apps/website/     → Marketing landing (public)
services/bff/     → Express BFF (trust boundary, owns auth + secrets)
i18n/             → en.json, pl.json, es.json (source of truth)
foundation/       → Active docs, specs, ADRs (archive/ for frozen material)
brand/            → Design tokens, logos, fonts
```

## Architecture Rules (NEVER violate)

1. **BFF is the only trust boundary.** Frontends have zero secrets. All auth, DB, external APIs go through `services/bff/`.
2. **Views vs. Data separation.** Navigation items, labels, icons, feature flags → config-driven, never hardcoded in components. White-label tenants swap data layer only.
3. **All copy in i18n JSON.** Never hardcode user-facing strings in components. Use `$t('key')`.
4. **TypeScript strict.** No `any`, no type assertions without justification.
5. **No mock-only tests for BFF.** Integration tests must hit real DB (lessons learned from prod divergence).

## Tech Stack
- Vue 3.5, Vite 7, Pinia 3, Vuetify 3.12, Vue Router 4.5, Vue i18n 10
- Express 4, PostgreSQL 15 (pg 8), express-session, bcrypt, nodemailer
- Vitest 4, ESLint 9, TypeScript 5.6, Prettier 3.2
- pnpm 9 workspaces, Husky pre-commit hooks

## Key Paths
- BFF routes: `services/bff/src/routes/`
- BFF auth: `services/bff/src/auth.ts`
- DB schema: `services/bff/migrations/` (run in order)
- App router: `apps/app/src/router/`
- App stores: `apps/app/src/stores/`
- App composables: `apps/app/src/composables/`
- API composable: `apps/app/src/composables/useBffApi.ts` (use this for all BFF calls)
- App config: `apps/app/src/composables/useAppConfig.ts`
- Tenant config: `foundation/config/`

## Database
User/account model has 3 distinct identity types — do NOT conflate them:

| Table | Who | Auth | App |
|---|---|---|---|
| `tbl_users` | Internal: reps, managers, admins (pharma company employees) | Google OIDC + password | apps/app |
| `tbl_hcp` | Healthcare Professionals (doctors, specialists) | magic link (planned) | HCP portal (future) |
| `tbl_patients` | Patients referred by HCPs | TBD (future) | TBD |

All tables:
`tbl_leads`, `tbl_users`, `tbl_hcp`, `tbl_hco`, `tbl_patients`, `tbl_events`, `tbl_presentations`, `tbl_app_config`, `tbl_audit_log`, `tbl_console_errors`

- New tables → add a migration in `services/bff/migrations/` (next number, `.sql`)
- Migrations run automatically on BFF startup via `db/migrations.ts`
- **OPEN QUESTION**: HCP auth strategy — magic link vs. separate OIDC vs. shared auth service. Needs architecture decision before building HCP portal.

## Auth
- Session cookie (httpOnly), remember-me tokens
- Roles: `admin`, `manager`, `rep` — region-scoped
- RBAC middleware: `services/bff/src/auth.ts`
- `tbl_hcp` auth: magic link planned — NOT YET IMPLEMENTED (needs architecture decision first)

## i18n
- Active languages: EN, PL, ES
- Add keys to `i18n/en.json` first, then run `npm run i18n:extract`
- Never leave a key only in one language file — CI enforces parity

## Tests
- Run: `pnpm test` (all workspaces)
- CI blocks merge if tests fail or if no test files exist
- Pre-commit: lint + typecheck + test

## Dev Workflow
```bash
pnpm start             # Docker (Postgres) + BFF + app concurrently
pnpm build:app         # Build app
pnpm build:website     # Build website
pnpm ci                # Full CI gate: lint + typecheck + test
pnpm i18n:extract      # Extract new i18n keys from source
pnpm i18n:prune        # Mark unused keys
```

## Deployment
- FTP to GoDaddy (current, to be migrated to VPS)
- UAT: app-uat.neosleepcare.com | Prod: app.neosleepcare.com
- CI/CD: `.github/workflows/deploy-app.yml`, `deploy-website.yml`
- Promote UAT → Prod via `promote-app-uat-to-prod.yml`

## What NOT to do
- Do not hardcode navigation items, labels or feature flags in components
- Do not put secrets in frontend code
- Do not skip migrations — always add a new numbered `.sql` file
- Do not add translation keys directly in PL/ES files — always start from `en.json`
- Do not bypass Husky hooks (`--no-verify`)
- Do not mock PostgreSQL in BFF integration tests
- Do not start portal or admin apps until rep app Stage 1-3 is done

## Current Focus (March 2026)
Stage 1: Google Workspace OIDC — rep logs in, sees their data (mocked).
Next: Stage 2 (direct DB) → Stage 3 (CRM views complete).
Portal and admin are archived — do not start until rep app MVP is done.
