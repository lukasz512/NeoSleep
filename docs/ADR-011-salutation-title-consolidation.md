# ADR-011: Consolidate salutation on identities.title, drop practitioner.salutation

## Status
Accepted

## Context
`GET /api/v1/patient` and `GET /api/v1/practitioner` returned 503 (`column "salutation" does not exist`) against the live Supabase DB. `identities` (TPT base table for all person types) has a `title TEXT` column that is functionally the salutation field ("Dr.", "Prof.", "Mgr." — works for pharma and hospitality contexts per the original migration comment). `practitioner` additionally had its own, separate `salutation TEXT` column — a physical duplicate of the same concept on a different table. `patient` correctly has no salutation-like column of its own and relies entirely on `identities`, which is the TPT pattern working as intended. `practitioner.salutation` was the outlier: it should have been removed when the shared `identities.title` field was introduced, but wasn't.

Application code (`patient.ts`, `practitioner.ts`, `seed-demo.ts`) referenced `identities.salutation` (which never existed) and, for practitioner, could have used the real `practitioner.salutation` column instead — Postgres's own error hint suggested exactly that.

## Decision
Consolidate on `identities.title` as the single source of truth for the salutation/prefix field across all person types (patient, practitioner, users), matching the TPT pattern already used correctly by `patient`. Drop the duplicate `practitioner.salutation` column.

Considered and rejected: keeping both physical columns and just pointing `practitioner.ts` at its own `salutation` column (smaller diff, zero migration) — rejected because it leaves the TPT violation in place as permanent debt rather than fixing it while the cost is still near-zero (pre-launch, no real production data).

Implementation:
- Migration `003_practitioner_drop_duplicate_salutation.sql` redefines `create_tenant_schema()` without the duplicate column (so future tenants get the correct shape) and drops the column from every already-provisioned tenant schema.
- `patient.ts` / `practitioner.ts` read and write `identities.title`, aliased as `salutation` in SQL (`i.title AS salutation`) and kept as `salutation` in the TypeScript/JSON layer — the API contract is unchanged, so no PWA/frontend changes were needed.

## Consequences
- One name for this field at the DB layer (`title`) with a stable, unchanged API/PWA-facing name (`salutation`) — the JS/JSON boundary is where the alias lives, not scattered across queries.
- Any `practitioner.salutation` value written between this bug being introduced and this migration running is not recoverable (rollback restores an empty column, not prior data) — acceptable given pre-launch stage, no real practitioner records existed yet.
- Surfaced separately, not acted on here: ADR-004 ("person as TPT base table, renamed from identities") is Accepted but not implemented — the live migration still creates a table literally named `identities`. Tracked as open debt, not fixed as part of this change.

## Compliance Impact
None — no change to what personal data is stored, only which column holds it.
