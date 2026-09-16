## Refined User Story: HCO — retire `region` as an editable field in favor of `territory_id`

**Classification**: trivial — resolves a decision `docs/stories/hco-detail-view-badges-and-parity.md` explicitly left open, scoped to `organization` only. No migration/backend/frontend change touches `identities`/`patient`/`practitioner`/`auth.ts`/`consent`/`audit_log`.

**Raw input**: NEO-6, reopened after being marked done while the ticket's literal ask ("we will use territory... zamien to na territory") was still unresolved on the edit form. Łukasz chose the full-migration option when asked directly; scope confirmed to organization (HCO) only, with the broader platform-wide question (identities + encounter, ~19 files) tracked as a separate backlog decision rather than guessed at here.

### As a rep/manager/admin editing an HCO, I want `territory_id` to be the only geographic field I set, so that the form isn't showing two overlapping, confusing inputs for the same concept.

### Stakeholder Notes
- User: The edit form no longer shows a `region` autocomplete — `territory_id` is the sole geographic input, matching the pattern already established for the view side (`territoryLabel`'s `territory_name || region || "—"` fallback, unchanged).
- Client/Tenant: No behavior change to list filtering/sorting/search (`db/organization.ts`'s `region`-based filter/sort/search is untouched) — this is a form-input change plus a data backfill, not an API contract change.
- Patient: No impact — organization-only change.
- NeoCRM/Platform: New migration `apps/api/migrations/026_organization_territory_backfill.sql` backfills `territory_id` from any existing `region` value by matching `territory.code` (case-insensitive), for every tenant schema — additive only, no column drop. Verified against the live dev DB before writing this: 8 organizations total, 0 currently have a non-empty `region` — this is a no-op today but exists for correctness and as the reference implementation if the broader migration is scoped later.
- Compliance: `region` column is deliberately **not** dropped or deprecated in this pass — it stays readable, matching the standard expand-contract pattern for retiring a column safely. No `audit_log`/history allowlist change needed since nothing is being removed from the schema.

### Acceptance Criteria
- [x] `apps/api/migrations/026_organization_territory_backfill.sql` added, run against dev DB, verified idempotent (0 organizations with a real `region` value and no `territory_id` afterward, in both `neosleep` and `fourseasons` schemas).
- [x] `apps/pwa/src/config/forms/hcoForm.ts`: `region` field and its now-unused `loadRegionOptions()` loader removed; `territory_id` widened from `cols: 6` to `cols: 12` (it no longer shares a row with `region`).
- [x] `apps/pwa/src/config/forms/hcoForm.spec.ts` updated to match (new field-order assertion, new explicit "no region field" test).
- [x] `pnpm --filter @neo/pwa lint/typecheck/test` and `pnpm depcruise` all clean (pre-existing warnings only).

### Open Questions (tracked separately, not answered here)
- [ ] Platform-wide `region` retirement (`identities` — users/practitioner/patient/lead — and `encounter`) — its own backlog ticket, needs an ADR given the compliance-sensitive surface it touches.

### Hand-off
-> None required for this scope. The platform-wide follow-up should reuse this migration's backfill technique (match by `territory.code`) and follow an expand-contract sequence (backfill → switch consumers → deprecate → drop, each its own step) rather than a single combined migration.
