## Common Architectural Mistakes in This Stack

| Mistake | Why It's Dangerous | Correct Pattern |
|---|---|---|
| Setting `search_path` per request instead of per connection transaction | Race condition at high concurrency | Always use `withTenant()` which wraps in a transaction |
| Storing session tenant in frontend state | Forgeable — user can change it | Tenant must come from the authenticated server session |
| Using `ON DELETE CASCADE` on business data | Silent data loss across schemas | Use soft delete + explicit cleanup jobs |
| Sharing `platform.lookups` IDs directly in tenant records | Breaks when platform data changes | Use `code` as stable reference, not `id` |
| Putting feature logic in components | Makes white-labeling a rewrite | Feature flags drive rendering from config |
| Migration without rollback plan | One bad deploy = downtime | Every migration must have a documented rollback SQL |
| No audit_log on GDPR Art.9 data mutations | Regulatory violation | Audit write is mandatory, not optional |

---

## Key Files

| File | Purpose |
|---|---|
| `apps/api/src/db/tenant.ts` | `withTenant()` implementation |
| `apps/api/src/db/connection.ts` | PostgreSQL pool |
| `apps/api/src/auth.ts` | Session auth, role check middleware |
| `apps/api/migrations/` | Numbered SQL migrations, auto-run on startup |
| `docs/` | ADRs and architecture docs |
| `docs/API_CONTRACT.md` | Living API contract — all routes documented here |
| `packages/i18n/en.json` | Source of truth for all i18n keys |
| `.claude/skills/arch/references/db.md` | DB-specific rules and migration checklist |

### Skill Assets & Contracts

| File | Purpose |
|---|---|
| [assets/examples/good-adr.md](../assets/examples/good-adr.md) | ADR format — breaking change policy, compliance impact, consequences |
| [assets/examples/good-multi-tenant.md](../assets/examples/good-multi-tenant.md) | Multi-tenant isolation — withTenant(), RequestContext, requireAuth, audit in transaction |
| [assets/examples/good-feature-flags.md](../assets/examples/good-feature-flags.md) | Feature flags — plan gating, tenant/company overrides, route guard, frontend decoration |
| [assets/examples/good-schema-patterns.md](../assets/examples/good-schema-patterns.md) | Schema patterns — erased_at, encryption, version/locking, retain_until, composite indexes, territory |
| [assets/examples/good-fhir-alignment.md](../assets/examples/good-fhir-alignment.md) | FHIR R4 alignment — location, lead→hcp, hcp_role + period, consent GDPR+LFPDPPP, SearchParameter |
| [assets/examples/good-fhir-api.md](../assets/examples/good-fhir-api.md) | FHIR R4 API — CapabilityStatement, OperationOutcome dual format, Identifier[] migration |
| [assets/examples/good-lookup-i18n.md](../assets/examples/good-lookup-i18n.md) | Lookup → CodeableConcept + i18n labels + Bundle format + AuditEvent agent structure |
| [../dev/assets/examples/good-error-handling.md](../../dev/assets/examples/good-error-handling.md) | → `/dev` — AppError, FHIR codes, useAsync, AppErrorAlert |
| [../assets/examples/good-entity-spec.md](../assets/examples/good-entity-spec.md) | → `/arch db` — entity variants, DB schema, indexes, pipeline |
| [../_contracts/arch→dba.md](../../_contracts/arch→dba.md) | Input/output contract for arch→dba delegation |
| [../_contracts/arch→legal.md](../../_contracts/arch→legal.md) | Input/output contract for arch→legal delegation |
| [../_contracts/arch→qa.md](../../_contracts/arch→qa.md) | Input/output contract for arch→qa delegation |

---

## Reference: Architecture Doc Format

Use this asset as the canonical template for all NeoCRM architecture documentation.
Marcin's tattoo-spots-ai project (`docs/marcin/architecture.md`) is the gold standard for how architecture docs should look — clean stack table, monorepo diagram with ports, request flow, module pattern, DB decisions, CI/CD table.

- [architecture-doc-template.md](../assets/architecture-doc-template.md) — NeoCRM-adapted architecture doc template: stack table, monorepo structure, app descriptions, request flow, DB decisions, CI/CD, security. Fill this in and keep it at `docs/architecture.md`.
- [../../../docs/marcin/architectureNEO.md](../../../../docs/marcin/architectureNEO.md) — Inspiration: neoCRM vision architecture (NestJS/React → annotated with `-todo` markers where Vue replaces React). Shows the target structure: `apps/api` (3000), `apps/web` (3001), `apps/client-pwa` (3002), Docker topology, env vars table, module pattern, request flow pipeline. Use as a benchmark when planning structural decisions — match this quality and clarity.

### Monorepo Structure (implemented 2026-07-07)

```
apps/
  api/          ← Express BFF
    client/     ← @neo/api-client — frontend HTTP fetch wrapper, kept next to the API it calls
  pwa/          ← Vue 3 PWA rep app
  web/          ← Vue 3 marketing site
  telegram/     ← Telegram bot (moved from services/telegram)
packages/       ← Everything shared/reusable lives here — one folder, not two (platform/ was folded in)
  i18n/         ← en.json, pl.json, mx.json, tenant overrides (moved from platform/i18n); also locale-bound composables (useDocumentLang) — logic that reacts to locale lives next to the locale data
  brand/        ← logos, design tokens, shared global CSS (transitions.css); global defaults — per-tenant branding comes from app_config in DB, not more root folders
  ui/           ← Vuetify component library + Vuetify plugin setup
  stores/       ← Pinia stores shared across apps
  vuetify/      ← Vuetify plugin setup
infrastructure/ ← Docker Compose, nginx, scripts (renamed from infra/; scripts/backup.sh moved here from root scripts/)
docs/           ← architecture.md, ADRs, foundation/ (backlog, presentations)
.github/
  workflows/
```

Key structural principle from Marcin's project: **the API is an app, not a service**. `apps/api/` makes every port, every module, every route visible at the same level as the frontends that consume it. Each team member opens `apps/` and sees the whole system. Same principle applied to `apps/api/client/`: the API's own frontend SDK lives next to the API, not in a separate top-level package.

`services/` no longer exists: `services/api` → `apps/api`, `services/telegram` → `apps/telegram`, `services/fastapi` deleted (unused parallel FastAPI/JWT experiment — zero references in docker-compose/CI/code, was the source of an earlier JWT-vs-session auth mismatch). `platform/` no longer exists — folded entirely into `packages/`. `platform/foundation/` never actually existed despite being referenced in old docs — the real foundation docs live in `docs/foundation/`. Root `scripts/` no longer exists — its one file (`backup.sh`) moved into `infrastructure/scripts/`.

---

## Known Architectural Debt — Open Doors to Manage

These items are documented decisions to defer — not forgotten gaps. Each has an ADR or is tracked here explicitly.

| Item | Status | ADR | When to act |
|---|---|---|---|
| `audit_log` tamper-proof (write-once storage) | ⚠️ Proposed | [ADR-010](../../../../docs/ADR-010-audit-log-immutability.md) | Before first regulated tenant (neosleep_mx patient data) |
| FHIR R4 Phase 1 (CapabilityStatement + OperationOutcome + Identifier[]) | 🔶 In progress | [ADR-009](../../../../docs/ADR-009-fhir-compliance-scope.md) | Before enterprise/Veeva integration or FHIR conformance test |
| Consumer-driven contract tests (Pact) | 📋 Backlog | — | Before second tenant goes live (Alfred) |
| `pg_partman` on production DB | ⚠️ Pending verification | — | Before encounter table migration to PROD |
| Event-sourcing (`event_store`/`emitEvent`) removed from practitioner/patient/lead/encounter commands — table never existed, was throwing at runtime | ✅ Done (2026-07-07) | — | Reconsider only if a real event-replay use case emerges; `audit_log` covers compliance trail |

**Rule**: If an item above becomes a blocker, write an ADR and move it to the ADR table. Do not silently fix without documentation.

---

## When to Update `docs/`
Trigger on: "doc", "ADR", "architecture changed", "we decided", "why did we X", "document this", or any decision from the ADR table above being revisited.

## ADR Format
```markdown
# ADR-XXX: [Title]

## Status
Accepted | Proposed | Deprecated

## Context
[Why did this decision need to be made?]

## Decision
[What exactly was decided?]

## Consequences
[Trade-offs, what this enables, what it closes off]

## Compliance Impact
[GDPR / HIPAA / LFPDPPP / PDPA implications if any]
```
