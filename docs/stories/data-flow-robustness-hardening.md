## Refined User Story: Data-flow / repo-robustness hardening (three streams)

**Classification**: feature
**Raw input**: Skill-auditor + manual audit pass (2026-09-20) surfaced three gaps between what CLAUDE.md documents as enforced and what is actually enforced in this repo:
1. Husky pre-commit/pre-push hooks are configured (`core.hooksPath` → `.husky/_`) but no `.husky/pre-commit` or `.husky/pre-push` file exists, so every local hook silently no-ops. CLAUDE.md claims "Pre-commit: lint + typecheck + test" and "Do not bypass Husky hooks (--no-verify)" — currently nothing to bypass. Only real enforcement today: Claude Code's own Stop hook (`quality-gate.sh`, session-scoped) and CI on PR (after push).
2. `apps/api`'s `create_tenant_schema()` Postgres function (defined in migration 001, last redefined in 003) is stale relative to 13 later migrations (004, 005, 006, 008, 009, 010, 012, 015, 017, 018, 020, 021, 022) that alter existing tenant schemas via ad-hoc loops over `platform.tenants` without ever updating the function body. `apps/api/scripts/sync-test-schema.ts`'s own doc comment confirms this and works around it by cloning the live `neosleep` schema instead of calling the function. Dormant today (single tenant, always provisioned by replaying every migration in order) but a landmine for the planned white-label multi-tenant provisioning flow — `arch/SKILL.md`'s documented future `POST /platform/tenants` already correctly plans to "run all tenant migrations" rather than call this function, but the function's name and existence invite a future implementer to call it directly without knowing this history.
3. CLAUDE.md claims "TypeScript strict, no `any`" and "CI enforces i18n parity" but neither is mechanically enforced: no `@typescript-eslint/no-explicit-any` rule in `eslint.config.mjs`, and no i18n key-parity script or CI step anywhere in the repo (only `i18n:extract` / `i18n:unused` exist).

Łukasz asked for all three to be implemented.

### As a developer maintaining NeoCRM, I want the engineering guarantees CLAUDE.md documents (pre-commit gating, a correct tenant-provisioning schema, strict TypeScript, i18n parity) to be mechanically true, so that "slop" isn't caught only by luck, a human remembering, or a Claude Code session happening to be involved

### Stakeholder Notes
- 👤 User: No direct effect on reps/KAMs/FFMs/MSLs — this is process hardening, not a UI capability. Indirect benefit: fewer regressions reach any environment they touch.
- 🏢 Client: Indirect but real for the *next* tenant onboarded — item 2 specifically protects the schema a new white-label pharma client would get provisioned into. A tenant silently missing `identities.region` or `lead.institution` would be a serious, hard-to-diagnose client-facing defect.
- 🩺 Patient: No direct effect for items 1 and 3. Item 2 has second-order patient-safety/compliance relevance — if a future tenant's schema silently lacked columns migrations 004-022 added (which include consent/notification/audit-adjacent changes), that tenant's compliance and care-coordination data could be incomplete without anyone noticing until an error surfaces in production.
- 🚀 NeoCRM/Platform: High relevance — this is explicitly platform-scalability work ahead of Stage 2/3 and the future multi-tenant provisioning endpoint. Directly reduces white-label onboarding risk.
- ⚖️ Compliance: No new personal-data collection or processing. Item 2 touches how tenant schemas (which hold GDPR/HIPAA-relevant tables) get created — worth `/dba` and `/arch` eyes given the FHIR/audit_log implications, but this is a correctness fix to existing documented behavior, not a new compliance surface.

### Medical-Industry Trend Check
n/a — internal engineering/infra hardening, not a clinical or HCP-facing change.

### Acceptance Criteria (testable)
**Stream 1 — Husky hooks**
- [ ] `.husky/pre-commit` runs lint + typecheck scoped to staged/changed files and blocks the commit on failure
- [ ] `.husky/pre-push` runs the test suite (scoped the same way `quality-gate.sh` scopes it — affected workspaces only) and blocks the push on failure
- [ ] A manual `git commit` / `git push` from outside Claude Code (plain terminal) is now actually gated — verified by a deliberate failing change
- [ ] CLAUDE.md's existing claims ("Pre-commit: lint + typecheck + test", "Do not bypass Husky hooks") become true instead of aspirational

**Stream 2 — `create_tenant_schema()` drift**
- [ ] `/arch assess` (or equivalent) decides the fix strategy: patch the function to match current schema state vs. deprecate it in favor of the "replay full migration history" approach `arch/SKILL.md` already documents for future tenant provisioning
- [ ] Whichever approach is chosen, a new tenant schema created today would be structurally identical to `neosleep`'s (verifiable by running `sync-test-schema.ts`'s comparison logic, or an equivalent diff, against a schema created the chosen new way)
- [ ] A safeguard exists so this can't silently drift again — e.g. a CI/gate check that fails when a migration alters tenant-schema tables without a corresponding update to the provisioning path, or the function is removed/deprecated entirely if the "replay migrations" approach is chosen instead
- [ ] `apps/api/scripts/sync-test-schema.ts`'s doc comment is updated or removed once the underlying drift it describes is resolved

**Stream 3 — ESLint `no-explicit-any` + i18n parity**
- [ ] `@typescript-eslint/no-explicit-any` (or equivalent strict rule) added to `eslint.config.mjs`; existing violations either fixed or explicitly justified per CLAUDE.md's "no type assertions without justification"
- [ ] An i18n parity script exists (compares keys across `packages/i18n/en.json`, `pl.json`, `mx.json`) and fails on mismatch
- [ ] i18n parity script wired into `.github/workflows/ci.yml` and into the Stream 1 pre-commit/pre-push hooks
- [ ] CLAUDE.md's "CI enforces parity" claim becomes true instead of aspirational

### Open Questions
- [ ] Stream 2 fix strategy (patch-in-place vs. deprecate-and-replay) is a real architecture decision, not mechanical — needs `/arch assess` before implementation, not just this enrichment pass
- [ ] Turning on `no-explicit-any` repo-wide may surface a non-trivial number of existing violations — scope/timebox for fixing vs. justifying-and-suppressing each one needs a call once the real count is known
- [ ] Should Stream 1's pre-commit lint/typecheck run on staged files only (fast, via lint-staged) or the whole affected workspace (slower, matches `quality-gate.sh`'s scoping) — affects tooling choice (need `lint-staged` as a new dependency, or not)

### Hand-off
→ `/arch assess create-tenant-schema-drift` — Stream 2, before any migration is written (touches DB schema / multi-tenant isolation)
→ `/dev feat husky-hooks` — Stream 1, scope is clear and self-contained
→ `/dev feat eslint-no-any-i18n-parity` — Stream 3, scope is clear and self-contained
