# Example: Pre-Release Architecture Gate

> Output of `/arch release-gate`. GO/NO-GO with all gaps recorded — never silently skipped.

---

# Release Gate: `v0.3.0-encounter-module`

**Branch**: `uat → PROD` | **Date**: 2026-03-22 | **Officer**: Łukasz

## Scope

| Area | Change | Risk |
|---|---|---|
| DB | Migration 004: `encounter` partitioned by month | High — first pg_partman use |
| API | New routes: GET/POST /api/encounters, PATCH /api/encounters/:id | Medium |
| API | `requireAuth` extracted to shared module | High — touches all routes |
| Frontend | `EncountersView.vue` + `useEncounters.ts` | Low |
| i18n | 34 new keys — EN/PL/MX | Low |

---

## Gate Results

### Security `/audit`
| Check | Result | Notes |
|---|---|---|
| All new routes behind `requireAuth` | ✅ | 3/3 verified |
| `req.body` validated | ✅ | zod schema on POST /encounters |
| No stack trace in error responses | ✅ | Global error handler |
| No secrets in frontend bundle | ✅ | `pnpm audit:bundle` clean |
| Auth middleware regression test | ⚠️ | **Gap #1** |

### Database `/dba`
| Check | Result | Notes |
|---|---|---|
| Migration has rollback SQL | ✅ | Tested on clean DB |
| `withTenant()` on all queries | ✅ | 4/4 functions |
| FK indexes present | ✅ | rep_user_id, practitioner_id, organization_id |
| pg_partman available in prod | ⚠️ | **Gap #2** |
| EXPLAIN ANALYZE on `getEncounters` | ✅ | Index scan confirmed at 1000 rows |
| No SELECT * | ✅ | |

### Compliance `/certification`
| Check | Result | Notes |
|---|---|---|
| `encounter` in GDPR data map | ✅ | `docs/data-map.md` updated |
| audit_log on create + update | ✅ | encounter.create / encounter.update |
| No hard DELETE | ✅ | soft delete only |
| Personal data in error logs | ✅ | `req.body` not logged |

### Tests `/qa`
| Check | Result | Notes |
|---|---|---|
| Unit tests `useEncounters.ts` | ✅ | 12 green |
| Integration: POST /encounters → real DB | ✅ | |
| Integration: tenant isolation | ⚠️ | **Gap #3** |
| i18n parity EN/PL/MX | ✅ | `pnpm i18n:prune` — 0 missing |
| TypeScript strict | ✅ | 0 errors |

### Release readiness `/delivery`
| Check | Result | Notes |
|---|---|---|
| Rollback plan | ✅ | `rollback-bff.yml` tested |
| git tag before deploy | ✅ | `v0.3.0-before-encounter` |
| Alfred notified | ✅ | Telegram 2026-03-15 |
| Health check post-deploy | ✅ | `/api/health` 200 in staging |

---

## Gaps

**⚠️ Gap #1 — Auth middleware regression** | Risk: High | Owner: Łukasz (dev)
Auth refactor (`requireAuth` → shared module) has no regression test. A misconfiguration silently unprotects all routes.
Fix: add integration tests — no session → 401, expired token → 401. CI must include both.
Deadline: before PROD. UAT allowed. ADR: No.

---

**⚠️ Gap #2 — pg_partman on production DB** | Risk: Medium | Owner: Łukasz (infra)
Migration 004 requires pg_partman extension. Not confirmed on GoDaddy prod instance. Missing extension = BFF starts with broken DB.
Fix: `SELECT * FROM pg_extension WHERE extname = 'pg_partman'` on prod. If missing, document install or fall back to trigger-based partitioning.
Deadline: before PROD. UAT allowed if UAT DB has it. ADR: Yes — if strategy changes → ADR-010.

---

**⚠️ Gap #3 — Tenant isolation test missing** | Risk: High | Owner: Łukasz (qa)
No test verifies that neosleep_pl cannot read neosleep_mx encounter records. Cross-tenant leak = highest GDPR severity.
Fix: create as Tenant A, attempt read as Tenant B → expect 404. Add as mandatory test for all entities with personal data.
Deadline: before PROD. UAT allowed. ADR: No.

---

## Decision

```
┌──────────────────────────────────────────┐
│  GATE: ✅ GO TO UAT                      │
│                                          │
│  BLOCK on PROD until:                    │
│  □ Gap #1 — auth regression tests        │
│  □ Gap #2 — pg_partman confirmed / ADR   │
│  □ Gap #3 — tenant isolation test        │
└──────────────────────────────────────────┘
```

## Evidence

| Artifact | Location |
|---|---|
| Migration SQL | `apps/api/migrations/004_encounter.sql` |
| Rollback SQL | `apps/api/migrations/004_encounter.rollback.sql` |
| git tag | `v0.3.0-before-encounter` |
| Alfred notification | Telegram #neosleep-mx-tech (2026-03-15) |
| Data map | `docs/data-map.md` (commit `a30b97cb`) |
