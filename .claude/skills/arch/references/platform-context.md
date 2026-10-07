## Platform Context

**NeoCRM** is a white-label medical CRM SaaS. NeoSleep is the first client.

### 3-Level Hierarchy
```
NeoCRM Platform (Łukasz's company)
├── Company: NeoSleep  → Tenant: neosleep     (schema `neosleep`     — regions: PL, MX, one schema, both countries)
└── Company: FourSeasons → Tenant: fourseasons (schema `fourseasons` — region: TH)
```
Verified against `platform.companies`/`platform.tenants` seed data (`apps/api/migrations/002_seed.sql`). Region is a `region`/country attribute on the tenant and on users/territories — **not** a separate tenant or schema per country (see CLAUDE.md "Project Overview"). `neosleep_pl` / `neosleep_mx` as separate schemas is not how this works — do not reintroduce that.

### Tech Stack
- **Runtime**: Node.js, TypeScript strict, Express 4
- **Frontend**: Vue 3.5, Vite 7, Pinia 3, Vuetify 3.12, Vue i18n 10 (PWA)
- **DB**: PostgreSQL 15, `pg` driver (no ORM), `withTenant()` for schema isolation
- **Auth**: Session cookie (httpOnly), Google OIDC + password fallback
- **Monorepo**: pnpm workspaces — `apps/pwa`, `apps/web`, `apps/api`, `packages/*`

### Schema Design (Current Canonical)

**Do not restate the table list here.** CLAUDE.md's "Database" section (root of the repo) is the single canonical, verified-against-`apps/api/migrations/`, list of platform and tenant tables — keeping a second copy here is exactly how this section went stale (it previously described a fictional `person`/`practitioner_role`/`pcf_template`/`observation`/`medication_request`/`communication`/`address`/`report` schema that was never built; none of those tables exist — verified 2026-09 against `apps/api/migrations/001_tenant_schema.sql` and every other migration file). Read CLAUDE.md for the table list. What's true and worth keeping here:

- Real base identity table: **`identities`** (TPT pattern) — `users`, `practitioner`, `patient`, `lead` extend it via `identity_id FK UNIQUE`. **Never `person`/`person_id`** — CLAUDE.md explicitly forbids that name for this concept.
- Real tenant naming: schema per **company**, not per country — e.g. schema `neosleep` holds both PL and MX (see 3-Level Hierarchy above), schema `fourseasons` holds TH.
- Platform-level tables live in `platform.*` (e.g. `platform.companies`, `platform.tenants`, `platform.users`, `platform.feature_flags`, `platform.lookups`) — confirmed to exist as described in CLAUDE.md.

### Key Patterns
- **`withTenant(slug, fn)`** — sets `search_path TO "${slug}", platform, public` for every DB call
- **TPT (Table Per Type)** — `identities` table as interface, `practitioner`/`patient`/`lead`/`users` extend it via `identity_id FK UNIQUE`
- **`metadata JSONB DEFAULT '{}'`** — on all main entity tables for extensibility without migrations
- **`lookups`** — two-layer: `platform.lookups` (global, locked), `{tenant}.lookup` (overrides + custom)
- **Soft delete** — `deleted_at TIMESTAMPTZ` on all user-facing data; `audit_log`/consent-relevant records: NEVER delete
- **Monthly partitions** on `encounter` by `created_at` (use `pg_partman`)
- **No `tbl_` prefix** anywhere — clean table names

---

## Architectural Decisions (ADRs)

Entries below #009 predate the `docs/ADR-NNN.md` file convention — no standalone doc exists for them, only this table. From #009 on, each has a real file in `docs/`.

| # | Decision | Status |
|---|---|---|
| 001 | Schema per tenant (not tenant_id column) — GDPR isolation, B2B model | ✅ Accepted |
| 002 | Single PWA, tenant selected at login via picker (not subdomain) | ✅ Accepted |
| 003 | `platform.users` separate from tenant `users` — cross-tenant access | ✅ Accepted |
| 004 | `identities` is the TPT base table name — CLAUDE.md explicitly forbids `person` for this concept | ✅ Accepted |
| 005 | `feature_flags` with scope_type/scope_id — no nullable FK columns | ✅ Accepted |
| 006 | `encounter` (FHIR-inspired) is the primary CRM contact record | ✅ Accepted |
| 007 | `mx` is internal locale key for Mexican Spanish (maps from `es-MX`) | ✅ Accepted |
| 008 | No ORM — raw SQL with parameterized queries + `withTenant()` wrapper | ✅ Accepted |
| [009](../../../../docs/ADR-009-fhir-compliance-scope.md) | FHIR R4 compliance — progressive 3-phase approach (Foundation → REST → SMART) | 🔶 In progress |
| [010](../../../../docs/ADR-010-audit-log-immutability.md) | Audit log immutability — append-only PostgreSQL role | ⚠️ Proposed |
| [011](../../../../docs/ADR-011-salutation-title-consolidation.md) | Salutation/title field consolidation | ✅ Accepted |
| [012](../../../../docs/ADR-012-notification-center.md) | Notification center (`notification` + `notification_delivery`) | ✅ Accepted |
| [013](../../../../docs/ADR-013-offline-read-cache.md) | Offline read cache for the PWA | ✅ Accepted |
| [014](../../../../docs/ADR-014-practitioner-doctor-identity-and-geography.md) | Practitioner/doctor identity linkage + geography | ✅ Accepted |
| [015](../../../../docs/ADR-015-one-name-for-the-api-server.md) | One name for the API server (`apps/api`) | ✅ Accepted |
| [016](../../../../docs/ADR-016-resend-transactional-email.md) | Gmail SMTP → Resend for transactional email | ✅ Accepted |
| [017](../../../../docs/ADR-017-partner-integration-pattern.md) | Partner integration pattern (OrthoApnea) | ✅ Accepted |
| [018](../../../../docs/ADR-018-hco-hcp-patient-required-contact-and-rbac.md) | HCO/HCP/patient required contact fields + RBAC | ✅ Accepted |

---

## FHIR Alignment (Medical Industry Standard)

NeoCRM is FHIR-inspired for tables that actually exist. Verified mappings only — do not add a row for a FHIR resource unless the table is confirmed in `apps/api/migrations/`:

| FHIR Resource | NeoCRM Table | Notes |
|---|---|---|
| `Patient` | `patient` (extends `identities`) | |
| `Practitioner` | `practitioner` (extends `identities`) | NPI/PWZ in `national_ids JSONB[]` (FHIR Identifier) |
| `Organization` | `organization` | Clinic, hospital, pharmacy |
| `Encounter` | `encounter` | All contact records — partitioned by month |
| `Consent` | `consent` | GDPR Art.7, PDPA, LFPDPPP |
| `AuditEvent` | `audit_log` | Compliance trail |

HCP credentials (`national_ids JSONB`): stores `{ "pwz": "...", "npi": "...", "cedula": "..." }`.

There is no `person`, `related_person`, `observation`, `communication`, or `medication_request` table in this codebase today — a prior version of this file described them as if they existed; they don't. If a future feature needs PCF capture, prescription tracking, or freeform notes, that's a real new-entity design decision (`/arch new-entity`), not something already built.

---
