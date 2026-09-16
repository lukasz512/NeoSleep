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
- [x] `apps/pwa/src/config/forms/hcoForm.ts`: `region` field and its now-unused `loadRegionOptions()` loader removed.
- [x] `apps/pwa/src/config/forms/hcoForm.spec.ts` updated to match (new field-order assertion, new explicit "no region field" test).
- [x] `pnpm --filter @neo/pwa lint/typecheck/test` and `pnpm depcruise` all clean (pre-existing warnings only).

### Follow-up round (same day, after local testing on this branch)
Łukasz tested this branch on localhost and asked for three more adjustments to the same edit form, plus flagged a real mobile-layout gap:
- [x] `territory_id`'s `hint` text (`app.patients.form.territoryHint`) removed — it read as a leftover, out-of-context description once `region` was gone.
- [x] Field pairing changed to match his explicit layout ask: `type`+`specialties` now share a row (`cols: 6` each, `specialties` was `12`), and `state`+`territory_id` now share a row (`territory_id` moved next to `state`, both `cols: 6`).
- [x] **Mobile responsive gap, app-wide, not HCO-specific**: `FormRenderer.vue`'s paired (`cols: 6`) fields used a hardcoded flex ratio (`rowItemStyle()`) with no breakpoint — on a narrow screen they'd just squeeze side by side instead of stacking. Fixed once, shared: `rowItemStyle()` now sets a `--pwa-form-col` custom property instead of `flex` directly (an inline `style.flex` would otherwise always beat a stylesheet media query regardless of specificity); `theme.scss`'s new `.pwa-form-row-item.pwa-form-col` rule stacks to full width below 600px (same breakpoint `HCODetailView.vue`'s own two-column layout already uses) and only applies the cols ratio at/above it. Deliberately scoped to a new `pwa-form-col` class so `EventForm.vue`'s unrelated use of the same base `.pwa-form-row-item` class (no inline ratio, always was `flex: 1 1 180px`) is untouched.
- [x] Unblocked by fixing an unrelated pre-existing test flake found via `quality-gate.sh`: `HCPDetailView.spec.ts` never awaited the `FormRenderer` async component's dynamic import (triggered merely by mounting the view, since `<FormRenderer>` is unconditional in the template even with the modal closed) — the import could still be in flight when the test file's environment was torn down, throwing an unhandled `EnvironmentTeardownError` that failed the whole `pnpm test` run despite all 252 assertions passing. Fixed with `await vi.dynamicImportSettled()` after mount. Confirmed unrelated to this branch's own changes (never touched `PhoneField.vue`/`FlagIcon.vue`/this spec file before) and re-ran the suite 3x clean after the fix to rule out a lucky pass on what was a real race condition.

### Open Questions (tracked separately, not answered here)
- [ ] Platform-wide `region` retirement (`identities` — users/practitioner/patient/lead — and `encounter`) — its own backlog ticket (NEO-31), needs an ADR given the compliance-sensitive surface it touches.

### Hand-off
-> None required for this scope. The platform-wide follow-up should reuse this migration's backfill technique (match by `territory.code`) and follow an expand-contract sequence (backfill → switch consumers → deprecate → drop, each its own step) rather than a single combined migration.
