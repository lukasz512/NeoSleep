## Tools & Checklists

### New Table Checklist
```
□ In the right schema? (platform vs tenant)
□ Extends identities via identity_id FK UNIQUE? (if it's a person)
□ Has: id UUID PK, created_at, updated_at, deleted_at (if user-facing)
□ Has: metadata JSONB DEFAULT '{}' (if main entity)
□ Every FK column has an index
□ Soft delete used (deleted_at) instead of hard DELETE?
□ PCF / audit_log / consents: NO deleted_at — NEVER delete
□ GDPR: does this table hold personal data? → add to data map in docs/
□ New migration file numbered correctly in apps/api/migrations/
□ Inserted any test data? → add to seed-demo.ts
```

### New API Endpoint Checklist
```
□ Route goes through requireAuth middleware
□ Uses withTenant() for all DB calls
□ Input validated (no raw req.body trust)
□ Sensitive data not leaked in error responses
□ Audit log entry written for mutations
□ Feature flag checked if behind a plan gate
□ No N+1 query patterns
□ EXPLAIN ANALYZE run if joining or filtering large tables
```

### New Vue Component / View Checklist
```
□ No hardcoded user-facing strings — all in i18n JSON
□ No navigation items or feature flags hardcoded in template
□ No role-based visibility without server-side enforcement
□ No sensitive data in localStorage
□ Loading / empty / error states handled
□ Mobile-first (rep app: touch targets ≥ 44px, one-handed use)
□ Vuetify components used — no raw HTML elements for UI primitives
```

### Migration Rollback Format — Mandatory on Every Migration

Every migration file must have a companion rollback block. No migration ships without it.

**Format** (in migration file header comment):
```sql
-- Migration: 004_territory.sql
-- Author: Łukasz
-- Date: 2026-03-22
-- Description: Add territory table for geographic hierarchy
--
-- ROLLBACK SQL (run only if migration must be reversed in production):
-- Preconditions: territory table must have 0 rows (or data migration run first)
--   DROP TABLE IF EXISTS territory;
-- End of rollback block

CREATE TABLE territory ( ... );
```

**Rollback checklist** — add to New Table Checklist:
```
□ Rollback SQL written in migration file header
□ Rollback SQL tested locally on clean DB (docker compose down -v && up)
□ Preconditions for rollback documented (e.g. "table must be empty")
□ If rollback is destructive (data loss): explicit sign-off in ADR required
□ No ON DELETE CASCADE on business data — cascades make rollback unpredictable
```

**Irreversible migrations** — if a migration cannot be safely rolled back (e.g. drops a column with data), document this explicitly:
```sql
-- ROLLBACK: NOT SAFE — column data cannot be recovered after this migration.
-- Rollback strategy: restore from backup (snapshot taken before this deploy).
-- Backup verified: [yes/no] — backup timestamp: [timestamp]
```

---

### API Versioning and Breaking Change Policy

See [ADR-009](../assets/examples/good-adr.md) for the full decision. Summary:

**Breaking change** = removing/renaming fields, changing types, removing endpoints, changing auth requirements.
**Non-breaking** = adding optional fields, adding endpoints, adding optional params.

| Change type | Action required |
|---|---|
| Breaking change | New `/api/v2/` prefix + ADR + 90-day deprecation window |
| Non-breaking change | Ship directly to `/api/v1/` (current) |
| FHIR endpoint change | Follow FHIR R4 versioning (fhirVersion param, CapabilityStatement) |

**Before shipping a breaking change**:
```
□ ADR written documenting what changed and why
□ Entry added to docs/API_CONTRACT.md changelog
□ Alfred (neosleep_mx contact) notified via Telegram with ≥30 days notice
□ Deprecation: true + Sunset: <date> headers added to old endpoint
□ Old endpoint kept alive for 90 days (2 release cycles minimum)
□ Rollback available without re-deploy (feature flag or parallel route)
```

---

### New Tenant Onboarding
Already built at the DB layer: `onboard_new_client()` (migrations/000_platform.sql),
documented there as "Called by BFF endpoint POST /api/admin/clients" — that route doesn't
exist yet, this is the future integration point for it.
```
1. INSERT into platform.companies
2. INSERT into platform.tenants
3. Calls create_tenant_schema(slug) — creates every tenant table, index, constraint
4. Seed default feature_flags (all off; enabled per contract)
5. Seed a blank app_config row
```
`create_tenant_schema()` (migrations/001, most recently redefined in
027_sync_create_tenant_schema.sql) is regenerated from the live "neosleep" schema whenever
a migration changes tenant tables — see 027's header for the exact approach — and
`apps/api/scripts/check-tenant-schema-parity.ts` fails CI if a future migration forgets
to do that, so **do not** let this function go stale again (it drifted silently for years
before 027 fixed it — see that migration's header for the full story).

### Compliance Data Map
When adding a table that stores personal data, register it:
- `identities` → first_name, last_name, email, phone — GDPR Art.6
- `patient` → diagnosis, medical_record — GDPR Art.9 (special category, encrypt at rest)
- `national_ids JSONB` → PESEL/SSN — GDPR special category, encrypt at rest
- `audit_log` → retain_until by jurisdiction (EU: 3y, US: 6y, MX: 5y, TH: 3y)
- `consent` → legal basis record, never delete

### Performance Checklist
```
□ EXPLAIN ANALYZE before finalizing any query on >1000 rows
□ encounter table: always filter by created_at (partition pruning)
□ Composite indexes for common filter patterns (territory + status, etc.)
□ JSONB fields: use GIN index if querying inside JSON
□ identities(email): index exists for cross-entity search
□ No SELECT * in production queries — always name columns
```
