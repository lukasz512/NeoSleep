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

Tenant schema (actual, per `apps/api/migrations/001_tenant_schema.sql` + `003_practitioner_drop_duplicate_salutation.sql`, the latter being the current `create_tenant_schema()` definition): `identities`, `users`, `user_roles`, `territory`, `organization`, `practitioner`, `patient`, `lead`, `supplier`, `sleep_study`, `treatment_plan`, `purchase_order` + `purchase_order_item`, `product`, `presentation`, `encounter` (+ `encounter_product`, `encounter_presentation`), `visit_plan`, `consent`, `efpia_disclosure`, `audit_log`, `request_log`, `conversation` + `message` (WhatsApp/SMS/email/in-app), `notification` + `notification_delivery`, `push_subscription`, `file_attachment`, `event` + `event_attendee`, `support_ticket`, `sample_batch`/`sample_stock`/`sample_transaction`/`sample_request`, `segment`, `lookup`, `app_config`, `i18n_overrides`, `training_course`/`training_lesson`/`training_progress`, `kpi_snapshot`, `sync_queue`

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

## Dev Workflow
```bash
pnpm start             # Docker (Postgres) + API server + app concurrently
pnpm build:pwa         # Build app
pnpm build:web         # Build website
pnpm ci                # Full CI gate: lint + typecheck + test
pnpm i18n:extract      # Extract new i18n keys from source
pnpm i18n:prune        # Mark unused keys
pnpm worktree:clean    # Dry-run: which worktrees/branches look closed (use /worktree-clean to remove — it checks Linear)
```

## Git / PR Workflow
- Never push directly to `dev`, `prod`, or any shared branch — always branch, commit, `git push -u origin <branch>`, and give the user the GitHub "create a pull request" link GitHub prints after the push (`https://github.com/<org>/<repo>/pull/new/<branch>`).
- **The PR itself is always created by the user, never by Claude/CI tooling on their behalf** — this holds even if `gh` is authenticated; review happens before a PR exists, not just before merge.
- This repo enforces the above with a GitHub ruleset that rejects direct pushes (`GH013: Repository rule violations — Changes must be made through a pull request`) — expect this on `git push` and don't try to route around it (no force-push, no branch-name workaround).
- This is an interim policy, not the final CI/CD design — a fuller flow (environments, required checks, promotion) is still to be worked out.

### Linear traceability
- Every non-trivial task (per `/enrich-user-story`'s trivial/feature split) gets a Linear ticket before a worktree/branch is created for it. Trivial fixes don't need one.
- Name the worktree/branch so the Linear ticket ID leads: `EnterWorktree(name: "<ticket-id>-<kebab-slug>")` (e.g. `eng-123-territory-admin-crud`). `EnterWorktree` prefixes `worktree-`, so the ID stays visible in the resulting branch (`worktree-eng-123-territory-admin-crud`) — this mirrors the nightly worker's own `worker/<ticket-id>-<slug>` pattern (`.claude/skills/linear-worker/SKILL.md`), same "ticket ID always leads" rule for human-initiated and automated work alike.
- As soon as that worktree/branch exists, comment on the Linear ticket with the branch name so the ticket shows "work started, on branch X" before any PR exists — do this before implementation starts, not as an afterthought.
- When handing the user the PR link after a push, prefer a pre-filled compare URL over the bare one GitHub prints — `https://github.com/<org>/<repo>/compare/dev...<branch>?quick_pull=1&title=<encoded-title>&body=<encoded-body>` — with the Linear ticket ID/title in `title` and a plain `NEO-<n>` reference (or a full Linear link) in `body`, so Linear can auto-link on merge if its GitHub integration is connected. **Never use `Fixes`/`Closes`/`Resolves <TICKET-ID>`** — see the 2026-09-20 correction below. This still only pre-fills GitHub's form; the user clicks "Create" themselves, same as always.
- Confirmed 2026-09-16: Linear's GitHub integration is connected for this repo/org — a branch name containing the ticket ID auto-links to the ticket, and a PR title/body with `Fixes <TICKET-ID>` (or `Closes`/`Resolves`) auto-transitions the ticket to Done on merge.
  **Correction, 2026-09-20**: that auto-close is exactly what Łukasz does *not* want — closing a ticket is a decision he wants to make himself, not a side effect of a PR merging (NEO-36/NEO-39 got silently auto-closed by PR #129's `Fixes` line and had to be manually reopened to `Needs Review`). Expectation, not yet independently verified on this repo: a plain ticket reference (`NEO-<n>` with no `Fixes`/`Closes`/`Resolves` in front of it) still creates the link/attachment when the PR merges, just without the status transition — this is standard Linear GitHub-integration behavior, but watch the next PR's ticket(s) to confirm it holds here too. Use plain references from now on, in PR bodies and anywhere else a ticket ID is cited (`linear-worker`'s own Step 9 already never used the magic-word form, so no change needed there).
- **Session title leads with the ticket ID too.** Claude Code auto-generates each session's title (shown in the VSCode sidebar) from the conversation itself — there is no tool to set it directly, only the user-run `/rename` command. A `PostToolUse` hook (`.claude/hooks/linear-ticket-created-title-reminder.sh`, matcher `mcp__claude_ai_Linear__save_issue`) fires whenever a *new* Linear ticket is created mid-conversation and surfaces the ticket ID so Łukasz can run `/rename` and Claude picks it up as `[<TICKET-ID>]` in its own replies. When the ticket ID is known before the session starts instead, just open the first message with `[<TICKET-ID>] ...` directly.
- Full rationale: `docs/stories/linear-task-traceability.md`.

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
