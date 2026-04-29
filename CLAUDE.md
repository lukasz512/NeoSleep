# NeoSleep — Claude Code Instructions

## Project Overview
pnpm monorepo: 2 Vue 3 + Vite apps + 1 Express API server + PostgreSQL.
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
services/api/     → Express API server (trust boundary, owns auth + secrets)
packages/         → Shared packages (@neo/api, @neo/ui, @neo/stores, @neo/utils)
shared/           → Shared composables (useDocumentLang, useReveal, useCountUp…)
i18n/             → en.json, pl.json, es.json, mx.json (source of truth)
foundation/       → Active docs, specs, ADRs
brand/            → Design tokens, logos, fonts
```

## Architecture Rules (NEVER violate)

1. **API server is the only trust boundary.** Frontends have zero secrets. All auth, DB, external APIs go through `services/api/`.
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
- API routes: `services/api/src/routes/`
- API auth: `services/api/src/auth.ts`
- DB schema: `services/api/migrations/` (run in order)
- App router: `apps/app/src/router/`
- App stores: `apps/app/src/stores/`
- App composables: `apps/app/src/composables/`
- API composable: `apps/app/src/composables/useBffApi.ts` (use this for all BFF calls)
- App config: `apps/app/src/composables/useAppConfig.ts`
- Tenant config: `platform/foundation/config/`

## Database
User/account model has 3 distinct identity types — do NOT conflate them:

FHIR R4-aligned schema. All tables use singular names, no `tbl_` prefix.

| Table | Who | Auth | App |
|---|---|---|---|
| `users` + `person` | Internal: reps, managers, admins (pharma company employees) | Google OIDC + password | apps/app |
| `practitioner` + `person` | Healthcare Professionals (doctors, specialists) | magic link (planned) | HCP portal (future) |
| `patient` + `person` | Patients referred by HCPs | TBD (future) | TBD |

Platform schema: `platform.companies`, `platform.tenants`, `platform.roles`, `platform.permissions`, `platform.platform_users`, `platform.feature_flags`

Tenant schema (FHIR naming): `person`, `users`, `user_roles`, `organization`, `practitioner`, `patient`, `related_person`, `lead`, `encounter`, `observation`, `communication`, `presentation`, `consent`, `app_config`, `audit_log`, `push_subscription`

- New tables → add a migration in `services/api/migrations/` (next number, `.sql`)
- Migrations run automatically on BFF startup via `db/migrations.ts`
- **OPEN QUESTION**: HCP auth strategy — magic link vs. separate OIDC vs. shared auth service. Needs architecture decision before building HCP portal.

## Auth
- Session cookie (httpOnly), remember-me tokens
- Roles: `admin`, `manager`, `rep` — region-scoped
- RBAC middleware: `services/api/src/auth.ts`
- `practitioner` auth: magic link planned — NOT YET IMPLEMENTED (needs architecture decision first)

## i18n
- Active languages: EN, PL, MX (Mexican Spanish)
- Internal locale IDs: `en`, `pl`, `mx` — `mx` is the app's internal key for `es-MX` (Mexican Spanish). The browser locale `es-MX` maps to `mx` internally via `i18n.ts`. Do NOT rename to `es-MX` — it is used consistently as a short key throughout the codebase.
- Add keys to `platform/i18n/en.json` first, then run `npm run i18n:extract`
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
- Environments (branch → URL):
  - DEV:  `dev` → app-dev.neosleepcare.com / dev.neosleepcare.com
  - UAT:  `uat` → app-uat.neosleepcare.com / uat.neosleepcare.com
  - PROD: `PROD` → app.neosleepcare.com / neosleepcare.com
- CI/CD: `.github/workflows/deploy-app.yml`, `deploy-website.yml`, `deploy-bff.yml`
- Promote DEV → UAT via `promote-dev-to-uat.yml`
- Promote UAT → PROD via `promote-app-uat-to-prod.yml` / `promote-website-uat-to-prod.yml`

## What NOT to do
- Do not hardcode navigation items, labels or feature flags in components
- Do not put secrets in frontend code
- Do not skip migrations — always add a new numbered `.sql` file
- Do not add translation keys directly in PL/ES files — always start from `en.json`
- Do not bypass Husky hooks (`--no-verify`)
- Do not mock PostgreSQL in BFF integration tests
- Do not start portal or admin apps until rep app Stage 1-3 is done

## Git tags — milestones
Use `git tag v<name>` to mark stable states before big changes:
```bash
git tag v1.0-rep-mvp       # milestone snapshot
git tag v0.9-before-rename # before a large refactor
git push origin --tags     # share tags with the team
```
Tags are immutable — always point to the same commit. Use `git checkout <tag>` to return to any point.

## Current Focus (March 2026)
Stage 1 done (OIDC auth, app shell, layout). Cleaning up before Stage 2 (real DB reads).
Next: Stage 2 (direct DB) → Stage 3 (CRM views complete).
Portal and admin: do not start until rep app Stage 1–3 is done.
