# NeoSleep — Claude Code Instructions

## Project Overview
pnpm monorepo: 2 Vue 3 + Vite apps + 1 Express API server + PostgreSQL (Supabase for MVP).
White-label pharma CRM SaaS. Tenants = pharma companies. Users = their field force (reps, KAMs, MSLs, FFMs).
Active markets: **PL, MX**. Thailand planned. One tenant can operate in multiple countries — country is a `region` attribute on users/territories, NOT a separate tenant.

## Terminology
- **HCP** = Healthcare Professional (doctors, dentists, ENT, pulmonologists, GPs)
- **HCO** = Healthcare Organization (clinic, hospital, practice)
- **MR / Rep** = Medical Rep / Sales Representative (field rep, primary app user)
- **KAM** = Key Account Manager (manages hospitals/large clinics, multi-stakeholder)
- **FFM** = Field Force Manager (manages a team of MRs, tracks team KPIs)
- **MSL** = Medical Science Liaison (scientific/educational HCP engagement, not promotional)
- **PCF** = Post Call Form (form filled after each HCP visit)
- **Tenant** = white-label client (pharma company licensing the platform)
- **Region** = country/territory grouping (PL, MX, TH) — attribute on users and HCPs, not a tenant

```
apps/pwa/         → Main PWA (sales rep CRM, mobile-first)
apps/web/         → Marketing landing (public)
apps/api/         → Express API server (trust boundary, owns auth + secrets)
apps/api/client/  → @neo/api-client — frontend HTTP fetch wrapper (kept next to the API it calls)
apps/telegram/    → Telegram bot
packages/         → Shared packages (@neo/ui, @neo/stores, @neo/vuetify)
packages/i18n/    → en.json, pl.json, mx.json (source of truth), plus locale-bound composables (useDocumentLang)
packages/brand/   → Design tokens, logos, fonts, shared global CSS (transitions.css) — per-tenant branding is DB-driven via app_config, not more folders
infrastructure/   → Docker Compose, nginx, scripts
docs/             → Architecture docs, ADRs, docs/foundation/ (backlog, presentations)
```

## Architecture Rules (NEVER violate)

1. **API server is the only trust boundary.** Frontends have zero secrets. All auth, DB, external APIs go through `apps/api/`.
2. **Views vs. Data separation.** Navigation items, labels, icons, feature flags → config-driven, never hardcoded in components. White-label tenants swap data layer only.
3. **All copy in i18n JSON.** Never hardcode user-facing strings in components. Use `$t('key')`.
4. **TypeScript strict.** No `any`, no type assertions without justification.
5. **No mock-only tests for BFF.** Integration tests must hit real DB (lessons learned from prod divergence).

## Tech Stack
- Vue 3.5, Vite 7, Pinia 3, Vuetify 3.12, Vue Router 4.5, Vue i18n 10
- Express 4, PostgreSQL 15 (pg 8), express-session, bcrypt, nodemailer
- **DB hosting: Supabase** (managed PostgreSQL, schema-per-tenant, built-in auth helpers, RLS)
- Vitest 4, ESLint 9, TypeScript 5.6, Prettier 3.2
- pnpm 9 workspaces, Husky pre-commit hooks

## Key Paths
- API routes: `apps/api/src/routes/`
- API auth: `apps/api/src/auth.ts`
- DB schema: `apps/api/migrations/` (run in order)
- App router: `apps/pwa/src/router/`
- App stores: `apps/pwa/src/stores/`
- App composables: `apps/pwa/src/composables/`
- API composable: `apps/pwa/src/composables/useBffApi.ts` (use this for all BFF calls)
- App config: `apps/pwa/src/composables/useAppConfig.ts`
- Tenant config: DB-driven, `app_config` table (tenant schema) — not a filesystem path

## Database

### Multi-tenancy model: schema-per-tenant on Supabase
- Each pharma company (tenant) gets its own PostgreSQL schema: `tenant_<slug>` (e.g. `tenant_acmepharma_pl`)
- Shared `public` schema for system-level tables (`tbl_tenants`, `tbl_app_config`)
- Supabase project: single instance for MVP. Connection string in `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` env vars (BFF only — never frontend)
- Migrations: `apps/api/migrations/` — numbered `.sql` files, run on BFF startup via `db/migrations.ts`
- New tables → always add a new numbered migration, never mutate old ones

### Identity types — do NOT conflate:

FHIR R4-aligned schema. All tables use singular names, no `tbl_` prefix.

| Table | Who | Auth | App |
|---|---|---|---|
| `users` + `person` | Internal: reps, managers, admins (pharma company employees) | Google OIDC + password | apps/pwa |
| `practitioner` + `person` | Healthcare Professionals (doctors, specialists) | magic link (planned) | HCP portal (future) |
| `patient` + `person` | Patients referred by HCPs | TBD (future) | TBD |

Platform schema: `platform.companies`, `platform.tenants`, `platform.roles`, `platform.permissions`, `platform.platform_users`, `platform.feature_flags`

Tenant schema (FHIR naming): `person`, `users`, `user_roles`, `organization`, `practitioner`, `patient`, `related_person`, `lead`, `encounter`, `observation`, `communication`, `presentation`, `consent`, `app_config`, `audit_log`, `push_subscription`

**OPEN QUESTION**: HCP auth strategy — magic link vs. separate OIDC. Decide before building HCP portal.

## Auth
- Session cookie (httpOnly), remember-me tokens
- Roles: `admin`, `ffm` (field force manager), `kam`, `msl`, `rep` — region-scoped
- RBAC middleware: `apps/api/src/auth.ts`
- `practitioner` auth: magic link planned — NOT YET IMPLEMENTED (needs architecture decision first)

## i18n
- Active languages: EN, PL, MX (Mexican Spanish)
- Internal locale IDs: `en`, `pl`, `mx` — `mx` is the app's internal key for `es-MX` (Mexican Spanish). The browser locale `es-MX` maps to `mx` internally via `i18n.ts`. Do NOT rename to `es-MX` — it is used consistently as a short key throughout the codebase.
- Add keys to `packages/i18n/en.json` first, then run `npm run i18n:extract`
- Never leave a key only in one language file — CI enforces parity
- RTL: not needed now. Thai (TH) uses LTR — but test font rendering

## Tests
- Run: `pnpm test` (all workspaces)
- CI blocks merge if tests fail or if no test files exist
- Pre-commit: lint + typecheck + test

## Dev Workflow
```bash
pnpm start             # Docker (Postgres) + BFF + app concurrently
pnpm build:pwa         # Build app
pnpm build:web         # Build website
pnpm ci                # Full CI gate: lint + typecheck + test
pnpm i18n:extract      # Extract new i18n keys from source
pnpm i18n:prune        # Mark unused keys
```

## Deployment
- FTP to GoDaddy (current, to be migrated to VPS)
- Environments (branch → URL): only `dev` and `prod` exist for now — UAT is removed from the project until reintroduced
  - DEV:  `dev` → pwa.dev.neosleepcare.com (rep app) / dev.neosleepcare.com (website)
  - PROD: `prod` → pwa.neosleepcare.com (rep app) / neosleepcare.com (website)
- CI/CD: `.github/workflows/deploy-pwa.yml`, `deploy-web.yml`, `deploy-bff.yml`
- Promote DEV → PROD via `promote-pwa-dev-to-prod.yml` / `promote-web-dev-to-prod.yml`

## What NOT to do
- Do not write non-English text anywhere in source: code, comments, console/log output, script echoes, hardcoded strings. English only, everywhere except `packages/i18n/pl.json` and `packages/i18n/mx.json` and seed/demo data that intentionally represents PL/MX market content
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
