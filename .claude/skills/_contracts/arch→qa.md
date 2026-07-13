# Contract: arch → qa

> **What this file is**: A formal interface between the Software Architect skill and the QA Engineer skill.
> Arch delegates test planning to QA after an entity spec is complete or before a release gate.
> QA returns a structured test plan that dev can implement.
>
> **Sources behind this contract**:
> - "Software Engineering at Google" (Winters, Manshreck, Wright, O'Reilly 2020) — Chapter 11 "Testing Overview": the 70/20/10 unit/integration/e2e split rule
> - NIST SP 800-115 "Technical Guide to Information Security Testing" — boundary condition and auth bypass test patterns
> - OWASP Testing Guide v4.2 — multi-tenant isolation test patterns (OTG-IDENT-005)
> - Health Catalyst engineering blog (2023) — "Why we test tenant isolation on every new table, not just at release time"
> - HL7 FHIR Connectathon test scripts — FHIR conformance test patterns used by Epic, Cerner, and others
> - **Pact (pact.io)** — consumer-driven contract testing framework; used by HIMSS Davies Award winners as their release gate mechanism for API contracts (Ford, Parsons, Kua "Building Evolutionary Architectures" 2nd ed. 2022, Chapter 6)

---

## When arch calls qa

Arch delegates to QA when:
- A new entity spec is complete and needs a test plan
- A release gate identifies missing test coverage
- A drift report finds an untested path
- A new security-sensitive feature is about to ship (auth, consent, cross-tenant data)
- The CLAUDE.md rule "no mock-only tests for BFF" needs enforcement

---

## INPUT FORMAT — arch → qa

```markdown
## QA Task: [task type]

**Context**: [1-2 sentences — what was built and why we need tests now]
**Priority**: [blocking | pre-UAT | this-sprint]
**References**: [entity spec, release gate, drift report, or ADR]

### Task Type
[one of: new-entity-test-plan | release-gate-coverage | tenant-isolation-audit | auth-regression | feature-compliance-test]

### Input Data

#### New Entity Test Plan (if task type = new-entity-test-plan)
Entity: [name]
DB table: [table name, schema]
API routes:
| Method | Path | Auth required | Role restriction |
|---|---|---|---|
| [GET/POST/PATCH/DELETE] | [path] | [yes/no] | [none/admin/manager/rep] |

Composable: [useX.ts path]
Personal data involved: [yes/no — if yes, which fields]
Tenant-scoped: [yes — always for tenant tables]
Special behaviors:
- [soft delete only? never delete?]
- [audit_log required on mutation?]
- [feature flag gated?]

#### Release Gate Coverage Request (if task type = release-gate-coverage)
Changed files:
- [list of changed routes, DB functions, composables]
Existing test files: [list of .spec.ts files that exist]
Known gaps: [list from release gate report]
Must pass before: [UAT | PROD]

#### Tenant Isolation Audit (if task type = tenant-isolation-audit)
Tables to verify: [list]
Auth mechanism: [session cookie with tenantSlug]
Test scenario: Authenticate as Tenant A, perform action, verify Tenant B cannot access result.
```

---

## OUTPUT FORMAT — qa → arch

```markdown
## QA Response: Test Plan for [entity/feature]

**Coverage target**: [unit: X% | integration: all routes | e2e: critical paths only]
**Test file locations**:
- Unit: [file path]
- Integration: [file path]
- E2E: [n/a or file path]

---

### Unit Tests — [composable or utility]

File: `[path].spec.ts`

| # | Test description | Input | Expected | Type |
|---|---|---|---|---|
| U-01 | [clear description] | [input state] | [expected output or state] | happy path |
| U-02 | [clear description] | [input state] | [expected output or state] | edge case |
| U-03 | [clear description] | [input state] | [expected output or state] | error case |

---

### Integration Tests — BFF Routes (hits real DB)

> ⚠️ CLAUDE.md rule: No mock PostgreSQL in BFF integration tests.
> All integration tests use Docker Postgres from `pnpm start`.

File: `[path].integration.spec.ts`

| # | Test description | Setup | Request | Expected response | Assertion |
|---|---|---|---|---|---|
| I-01 | [description] | [DB seed state] | [HTTP method + path + body] | [status code] | [body shape check] |
| I-02 | Unauthenticated request rejected | no session | GET /api/[entity] | 401 | `{ error: 'Unauthorized' }` |
| I-03 | Invalid input rejected | valid session | POST /api/[entity] with missing required field | 400 | `{ error: '...' }` |
| I-04 | Soft delete: record not returned after delete | create record, then delete | GET /api/[entity]/:id | 404 | record gone |
| I-05 | Audit log written on mutation | valid session | POST /api/[entity] | 201 | audit_log has 1 new row |

---

### Tenant Isolation Tests — MANDATORY for all tenant-scoped entities

> Source: OWASP OTG-IDENT-005 — Cross-Tenant Access Control Testing
> Rule: Every entity with personal or encounter data must have this test. Non-negotiable.

File: `[entity].isolation.spec.ts`

| # | Test | Setup | Request | Expected |
|---|---|---|---|---|
| T-01 | Tenant A cannot read Tenant B records | Create record in neosleep_pl | GET /api/[entity]/:id with neosleep_mx session | 404 |
| T-02 | Tenant A list does not include Tenant B records | Seed both tenants | GET /api/[entity] with neosleep_pl session | List contains only pl records |
| T-03 | Tenant A cannot mutate Tenant B records | Create record in neosleep_pl | PATCH /api/[entity]/:id with neosleep_mx session | 404 |

---

### Auth & Role Tests

| # | Test | Session | Expected |
|---|---|---|---|
| A-01 | No session → 401 | none | 401 Unauthorized |
| A-02 | Expired session → 401 | expired token | 401 Unauthorized |
| A-03 | Rep cannot access admin route | rep session | 403 Forbidden |
| A-04 | Manager cannot access admin route | manager session | 403 Forbidden |
| A-05 | Admin can access admin route | admin session | 200/201 |

---

### Edge Cases

| # | Test | Scenario | Expected |
|---|---|---|---|
| E-01 | [entity specific] | [description] | [expected behavior] |
| E-02 | Concurrent creation with same unique field | Two simultaneous POSTs with same `code` | One succeeds, one gets 409 Conflict |
| E-03 | Soft delete + re-create | Delete record, attempt create with same unique key | Should succeed (deleted records don't block new ones) |

---

### Coverage Summary

\`\`\`
Unit tests:         [n] tests in [file]
Integration tests:  [n] tests in [file]
Isolation tests:    [n] tests in [file] ← mandatory, cannot be 0
Auth tests:         [n] tests in [file]
Edge cases:         [n] tests in [file]

Total:              [n] tests

CI gate: pnpm test must pass all of the above before UAT merge.
\`\`\`
```

---

## Mandatory Test Types

These test types can never be omitted. If they are missing from any entity, QA must flag it as a blocker:

| Test type | Why mandatory | Source |
|---|---|---|
| Unauthenticated → 401 | A route without auth check = security vulnerability | OWASP API Security Top 10 — API1:2023 |
| Tenant isolation (T-01, T-02, T-03) | GDPR Art.32 — data isolation is a security control | OWASP OTG-IDENT-005, GDPR |
| Audit log written on mutation | SOC 2 CC7.2 — mutations must be logged | SOC 2 Type II, HIPAA §164.312(b) |
| Soft delete: record not returned | GDPR erasure must work correctly | GDPR Art.17 |

---

## Consumer-Driven Contract Tests (Pact) — API Fitness Function

For the API boundary between `apps/pwa` (consumer) and `apps/api` (provider), **Pact** is the recommended fitness function. This is stronger than manual API_CONTRACT.md review — it fails the build automatically when a provider breaks a consumer's expectation.

**How it works in NeoCRM:**
1. `apps/pwa` publishes a **pact file** (JSON describing what it expects from each endpoint — response shape, status codes, required fields)
2. `apps/api` runs **pact verification** in CI against the published pact
3. If `apps/api` changes a response shape that `apps/pwa` depends on → CI fails immediately, before deploy

**When to add Pact tests:**
- Any API endpoint that Alfred's tenant (`neosleep_mx`) or the rep PWA depends on for critical data flows
- Before any endpoint declared in `docs/API_CONTRACT.md` ships to production

**Pact task format** — arch passes to qa:
```markdown
## QA Task: pact-contract

Entity/endpoint: [e.g. GET /api/encounters]
Consumer: apps/pwa
Provider: apps/api
Critical fields in response: [list of fields that must not change shape]
Nullable fields: [fields that can be null — pact must allow it]
Auth required: [yes — session cookie]
```

**QA output**: pact file at `tests/contracts/[entity].pact.json` + verification script in `apps/api/src/pact.verify.ts`.

---

## Escalation Rules

QA escalates back to arch when:
- A test reveals an architectural problem (not just a bug) — e.g., withTenant() is missing
- A test for tenant isolation is impossible to write because the route doesn't support multi-tenant setup
- The test framework cannot test a required scenario without mocking the DB (escalate — CLAUDE.md prohibits this)

QA does NOT change application code. QA writes tests and reports findings. Arch owns the fix decision.
