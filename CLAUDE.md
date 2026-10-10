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
5. **No mock-only tests for the API server.** Integration tests must hit real DB (lessons learned from prod divergence).

## Tech Stack
- Vue 3.5, Vite 7, Pinia 3, Vuetify 3.12, Vue Router 4.5, Vue i18n 10
- Express 4, PostgreSQL 15 (pg 8), express-session, bcrypt, Resend (transactional email)
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
- API composable: `apps/pwa/src/composables/useApi.ts` (use this for all API calls)
- App config: `apps/pwa/src/composables/useAppConfig.ts`
- Tenant config: DB-driven, `app_config` table (tenant schema) — not a filesystem path
- Clinical protocol (source of truth for clinical forms and the treatment flow, by Dra. Lorena): `docs/clinical/protocolo-atencion/README.md`; read it before changing any clinical form

## Database

### Multi-tenancy model: schema-per-tenant on Supabase
- Each pharma company (tenant) gets its own PostgreSQL schema: `tenant_<slug>` (e.g. `tenant_acmepharma_pl`)
- Shared `public` schema for system-level tables (`tbl_tenants`, `tbl_app_config`)
- Supabase project: single instance for MVP. Connection string in `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` env vars (API server only — never frontend)
- Migrations: `apps/api/migrations/` — numbered `.sql` files, run on API server startup via `db/migrations.ts`
- New tables → always add a new numbered migration, never mutate old ones

### Identity types — do NOT conflate:

FHIR R4-aligned schema. All tables use singular names, no `tbl_` prefix.

| Table | Who | Auth | App |
|---|---|---|---|
| `users` + `identities` | Internal: reps, managers, admins (pharma company employees) | Google OIDC + password | apps/pwa |
| `practitioner` + `identities` | Healthcare Professionals (doctors, specialists) | magic link (planned) | HCP portal (future) |
| `patient` + `identities` | Patients referred by HCPs | TBD (future) | TBD |

`identities` is the shared base table (TPT pattern) — `users`, `practitioner`, `patient`, `lead` all extend it via `identity_id`. Do not use `person` anywhere in this project — `identities` is the only name for this concept, in schema, code, and docs.

Platform schema: `platform.companies`, `platform.tenants`, `platform.users`, `platform.feature_flags`, `platform.lookups`

Tenant schema (actual, per `apps/api/migrations/001_tenant_schema.sql` + `003_practitioner_drop_duplicate_salutation.sql`, the latter being the current `create_tenant_schema()` definition): `identities`, `users`, `user_roles`, `territory`, `organization`, `practitioner`, `patient`, `lead`, `supplier`, `sleep_study`, `treatment_plan`, `purchase_order` + `purchase_order_item`, `product`, `presentation`, `encounter` (+ `encounter_product`, `encounter_presentation`), `visit_plan`, `consent`, `efpia_disclosure`, `audit_log`, `conversation` + `message` (WhatsApp/SMS/email/in-app), `notification` + `notification_delivery`, `push_subscription`, `file_attachment`, `event` + `event_attendee`, `support_ticket`, `sample_batch`/`sample_stock`/`sample_transaction`/`sample_request`, `segment`, `lookup`, `app_config`, `i18n_overrides`, `training_course`/`training_lesson`/`training_progress`, `kpi_snapshot`, `sync_queue`

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
- Pre-commit (`.husky/pre-commit`): lint + typecheck, scoped to `apps/*/src` / `packages/*/src` changes
- Pre-push (`.husky/pre-push`): test, scoped to the workspaces the push actually touched
- **Every acceptance criterion has a test (CORE-182).** Story = `docs/stories/<ticket>-<slug>.md`; criteria are user paths (AC1..n); the proving test carries `@<TICKET> ACn` in its title; a UI change also needs a real-backend e2e (`apps/pwa/e2e`, no harness page). Wire the whole path (API, DB, every screen showing that data), not just the screen. `story-coverage.mjs` blocks pre-push, CI and the handover on gaps.

## Dev Workflow
```bash
pnpm start             # Docker (Postgres) + API server + app concurrently
pnpm build:pwa         # Build app
pnpm build:web         # Build website
pnpm ci                # Full CI gate: lint + typecheck + test
pnpm i18n:extract      # Extract new i18n keys from source
pnpm i18n:prune        # Mark unused keys
pnpm worktree:clean    # Dry-run: which worktrees/branches look closed (--auto removes all merged ones; runs by itself at session start)
```

## Workflow rules (full text + rationale: `docs/CLAUDE_WORKFLOW.md`, read it when shipping)
Hooks enforce all of these (`.claude/hooks/`, `quality-gate.sh`), so a block names what's missing.
- **Ticket first**: every change, trivial too, gets a ticket on the work board (`pnpm board create --team … --title … --body '## Problem / ## Change / ## Done when'`, ≤1500 chars; it lands in Building with the `session` label). Linear is read-only since CORE-187 (export + close ≈ 2026-11-07); the token lives in `.claude/local/board.json`. The team is **CORE** (platform, every tenant) or **NEO** (NeoSleep client work); when unsure, CORE. Keys are listed in `.claude/ticket-teams`.
- **Worktree per thread, never ask**: `EnterWorktree("<ticket-id>-<slug>")` before the first edit, then `pnpm board branch <KEY> <branch>` and comment it (`pnpm board comment`).
- **PRs are created only by Łukasz.** Push the branch (`git push -u origin <branch>`) and hand him the pre-filled compare URL (`…/compare/dev...<branch>?quick_pull=1&title=…&body=…`). Never push to dev/prod, never force-push. Cite tickets as a plain `NEO-<n>`, never `Fixes/Closes/Resolves`. Renovate is the only bot that opens PRs.
- **Artifact for every change** via `/ship-artifact`: What changed / Run it locally / Verify it. A UI change also needs a real before/after. It carries 3 links (Artifact, board card, VS Code session), plus the PR button once pushed, and gets one line in the Change Index. Link it on the ticket (`pnpm board link`) and move the ticket to **Needs Review** (`pnpm board move <KEY> needs_review`), never Done.
- **The PR link must be mergeable and CI-green.** Max 2 CI fix attempts, per `.claude/ci-autofix.json`, then escalate. After the merge, verify on pwa-dev (`devVerified` in the marker, `smoke-dev-bundle.mjs` + `smoke-dev-ui.mjs`, QA creds only in `.claude/local/qa-dev.json`).
- **Questions** come as a 3-button `/decision-form` (TDD first: what a test settles isn't asked). **Final replies** are ≤2 sentences + anything he must act on. The per-prompt hook injects both rules once per session.
- **Session cost (CORE-103)**: subagents default to Sonnet, so pass `model: "haiku"` for Explore/search. When the context guard fires, write `.claude/local/handoff/<topic>.md`. Compaction is automatic near ~180k (`CLAUDE_CODE_AUTO_COMPACT_WINDOW` in settings.json, CORE-175). 1 ticket = 1 session: after the handover, suggest /clear.
- Merged worktrees/branches are auto-removed at session start. To see what's left, run `pnpm worktree:clean`; never raw `git branch -D`.
- Mark stable states with milestone tags (`git tag v<name>`); see the doc.

## Deployment
- `apps/pwa` / `apps/web`: FTP to GoDaddy (current, to be migrated to VPS)
- `apps/api`: Render, auto-deploys on push to its tracked branch — see `render.yaml`. No GitHub Actions workflow for this; a git push is the whole deploy pipeline.
- Environments (branch → URL): only `dev` and `prod` exist for now — UAT is removed from the project until reintroduced
  - DEV:  `dev` → pwa-dev.neosleepcare.com (rep app) / dev.neosleepcare.com (website)
  - PROD: `prod` → pwa.neosleepcare.com (rep app) / neosleepcare.com (website)
- CI/CD: `.github/workflows/deploy-pwa.yml`, `deploy-web.yml`
- Promote DEV → PROD via `promote-pwa-dev-to-prod.yml` / `promote-web-dev-to-prod.yml`

## What NOT to do
- Do not write non-English text anywhere in source: code, comments, console/log output, script echoes, hardcoded strings. English only, everywhere except `packages/i18n/pl.json` and `packages/i18n/mx.json` and seed/demo data that intentionally represents PL/MX market content
- Do not hardcode navigation items, labels or feature flags in components
- Do not put secrets in frontend code
- Do not skip migrations — always add a new numbered `.sql` file
- Do not add translation keys directly in PL/ES files — always start from `en.json`
- Do not bypass Husky hooks (`--no-verify`)
- Do not mock PostgreSQL in API server integration tests
- Do not start portal or admin apps until rep app Stage 1-3 is done

## Current Focus (March 2026)
Stage 1 done (OIDC auth, app shell, layout). Cleaning up before Stage 2 (real DB reads).
Next: Stage 2 (direct DB) → Stage 3 (CRM views complete).
Portal and admin: do not start until rep app Stage 1–3 is done.
