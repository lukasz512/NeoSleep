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
apps/app/         → Main PWA (sales rep CRM, mobile-first)
apps/website/     → Marketing landing (public)
services/api/     → Express API server (trust boundary, owns auth + secrets)
i18n/             → en.json, pl.json, es.json, th.json (source of truth)
foundation/       → Active docs, specs, ADRs (archive/ for frozen material)
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
- **DB hosting: Supabase** (managed PostgreSQL, schema-per-tenant, built-in auth helpers, RLS)
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
- Tenant config: `foundation/config/`

## Database

### Multi-tenancy model: schema-per-tenant on Supabase
- Each pharma company (tenant) gets its own PostgreSQL schema: `tenant_<slug>` (e.g. `tenant_acmepharma_pl`)
- Shared `public` schema for system-level tables (`tbl_tenants`, `tbl_app_config`)
- Supabase project: single instance for MVP. Connection string in `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` env vars (BFF only — never frontend)
- Migrations: `services/api/migrations/` — numbered `.sql` files, run on BFF startup via `db/migrations.ts`
- New tables → always add a new numbered migration, never mutate old ones

### Identity types — do NOT conflate:

| Table | Who | Auth | App |
|---|---|---|---|
| `tbl_users` | Field force: MRs, KAMs, FFMs, MSLs, admins | Google OIDC + password | apps/app |
| `tbl_hcp` | Healthcare Professionals (doctors, dentists, specialists) | magic link (planned) | HCP portal (future) |
| `tbl_patients` | Patients referred by HCPs | TBD (future) | TBD |

All tables:
`tbl_tenants`, `tbl_leads`, `tbl_users`, `tbl_hcp`, `tbl_hco`, `tbl_patients`, `tbl_events`, `tbl_presentations`, `tbl_app_config`, `tbl_audit_log`, `tbl_diagnostics`

**OPEN QUESTION**: HCP auth strategy — magic link vs. separate OIDC. Decide before building HCP portal.

## Auth
- Session cookie (httpOnly), remember-me tokens
- Roles: `admin`, `ffm` (field force manager), `kam`, `msl`, `rep` — region-scoped
- RBAC middleware: `services/api/src/auth.ts`
- `tbl_hcp` auth: magic link planned — NOT YET IMPLEMENTED

## Compliance (MUST respect in every feature)
| Market | Regulation | Key requirement |
|---|---|---|
| PL/EU | GDPR Art. 9 | Health data = special category, explicit consent |
| MX | LFPDPPP | Aviso de privacidad + explicit consent for sensitive data |
| TH | PDPA | Similar to GDPR — explicit consent, data residency options |
| All | EFPIA / PhRMA Code | Rep–HCP interactions must be documented, no improper transfers of value |

- NeoSleep = **data processor**. Tenant (pharma company) = **data controller**. Each tenant needs a signed DPA before any data flows.
- PCF data (visit records) retention: 5 years minimum in EU pharma context (check per country)
- `tbl_audit_log` is mandatory — never skip audit logging for HCP/patient data mutations
- HCP has GDPR Art. 15 right to access their own data

## i18n
- Active languages: EN, PL, ES (MX variant), TH
- Add keys to `i18n/en.json` first, then run `npm run i18n:extract`
- Never leave a key only in one language file — CI enforces parity
- RTL: not needed now. Thai (TH) uses LTR — but test font rendering

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
- FTP to GoDaddy (current, migrating to Hetzner VPS post-MVP)
- Environments (branch → URL):
  - DEV:  `dev` → app-dev.neosleepcare.com / dev.neosleepcare.com
  - UAT:  `uat` → app-uat.neosleepcare.com / uat.neosleepcare.com
  - PROD: `PROD` → app.neosleepcare.com / neosleepcare.com
- CI/CD: `.github/workflows/deploy-app.yml`, `deploy-website.yml`, `deploy-bff.yml`
- Promote DEV → UAT via `promote-dev-to-uat.yml`
- Promote UAT → PROD via `promote-app-uat-to-prod.yml`
- **Supabase env vars** (BFF only, never frontend): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`

## What NOT to do
- Do not hardcode navigation items, labels or feature flags in components
- Do not put secrets in frontend code
- Do not skip migrations — always add a new numbered `.sql` file
- Do not add translation keys directly in PL/ES files — always start from `en.json`
- Do not bypass Husky hooks (`--no-verify`)
- Do not mock PostgreSQL in BFF integration tests
- Do not start portal or admin apps until rep app Stage 1-3 is done

## Current Focus (May 2026)
MVP: HCP database — centralized doctor records with visit history, filterable by rep/region/specialty.
Stage 1 done (OIDC auth, app shell). Stage 2 in progress (production Supabase DB, real data reads).
Next: Stage 2 (DB reads) → Stage 3 (CRM views: HCP list, profile, PCF history).
Do NOT start: HCP portal, patient features, admin panel — until rep app Stage 1–3 is done.
