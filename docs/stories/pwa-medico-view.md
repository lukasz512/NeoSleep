## Refined User Story: Practitioner detail — multi-clinic affiliations + primary clinic

**Classification**: feature
**Raw input** (NEO-17, "pwa: medico view", translated from Polish): "col6x2 — left: identity fields, right: clinic fields (name, address, etc.). A practitioner ('medico') can be added to multiple clinics; manager, admin, and rep can each choose the primary clinic. Do good planning, dev, tests etc. for this."

### As a rep, manager, or admin viewing a practitioner's detail page, I want to see and manage all the clinics they're affiliated with — and pick which one is "primary" — so that I know where to find/route this practitioner without guessing, even when they split time across multiple clinics.

### Stakeholder Notes
- 👤 **User**: Reps often see the same doctor at more than one location (hospital rounds vs. private practice). Today the practitioner record only has one `organization_id` — there's no way to record or see the other clinics at all, so reps currently work around this with notes or memory. A rep's own "primary" may legitimately differ from a colleague's (Dr. K at Hospital X for Rep A, at Clinic Y for Rep B) — this is the whole reason `practitioner_assignment.primary_org_id` exists in the schema already, unused.
- 🏢 **Client**: Tenant admins need one canonical "default" primary clinic (`practitioner_organization.is_primary`) for reporting, sample routing, and EFPIA disclosure purposes that isn't overridden per-rep. Multi-affiliation HCPs (hospital consultants, KOLs) are exactly the highest-value segment tenants care most about tracking accurately.
- 🩺 **Patient**: Indirect only. Accurate clinic/location data affects sample delivery and visit logistics, not clinical care directly. No new patient data collected or exposed.
- 🚀 **NeoCRM/Platform**: Directly reusable — every white-label tenant has multi-site HCPs, and the underlying `practitioner_organization`/`practitioner_assignment` tables are already generic FHIR-aligned schema (not built for this tenant specifically). This is closing a gap in already-planned schema, not new platform surface.
- ⚖️ **Compliance**: `practitioner` is the always-blocked category for the automated nightly worker per CLAUDE.md — that's why this sat blocked twice and is now being done in this human session. The write path changes an EFPIA-disclosure-adjacent field (which clinic a rep is officially linked to a practitioner through); RBAC on the write endpoints needs care but no new legal review is flagged — same consent/data model as existing practitioner fields.

### Medical-Industry Trend Check
- Multi-affiliation HCP profiles are treated as standard in current pharma CRM practice: "physician profiles contain rich detail including practice locations (and multiple offices), current and historical affiliations" — [360 Degree HCP Profile: How Pharma Uses AI & Real-Time Data](https://multiplierai.co/blog/360-degree-hcp-profile-ai-pharma/)
- Modeling this as a single "current employer" field (which is what `practitioner.organization_id` does today) is called out as a known anti-pattern: "you cannot attribute an interaction to the site where it happened, and you cannot count an institution's prescribers without either double counting people who are affiliated in more than one place or losing the ones whose primary affiliation sits elsewhere" — [HCP and HCO Entity Resolution: Fixing Pharma Master Data](https://sakaradigital.com/blog/entity-resolution-hcp-hco-master-data-pharma-commercial/). This directly validates keeping the junction-table approach (`practitioner_organization`) rather than extending the single `organization_id` field.

### Design decisions confirmed with Łukasz (resolves the two questions that blocked the automated worker twice)
1. **Dual-scoped primary clinic.** Rep view reads/writes `practitioner_assignment.primary_org_id` (their own rep↔practitioner relationship — one row per `(practitioner_id, user_id)`, already unique-constrained). Admin/manager view reads/writes `practitioner_organization.is_primary` (the shared global default — one `true` per practitioner, enforced at the write, not by a DB constraint since Postgres can't do a "exactly one true per practitioner_id" check constraint directly).
2. **RBAC**: admin, manager, and rep can all set their applicable primary (no read-only role).
3. **Scope includes affiliation management**, not just primary-picking: this ticket also builds add/remove of which clinics a practitioner belongs to (`practitioner_organization` rows), since nothing in the codebase creates these today — the only existing reader is the unauthenticated public specialist search (`apps/api/src/db/organization.ts`'s `getPublicSpecialists`), which is unrelated and untouched by this work.

### Scope confirmed via codebase investigation
- `apps/pwa/src/views/HCPDetailView.vue` already has a "Details" tab (single-column `view-item__row` list: email, phone, specialty, single institution link, region) — this is the col6x2 target, not a new page. `DetailViewTabs` pattern and tab list stay; only the `#details` slot content is restructured into two `VCol cols="6"` (left: existing identity rows; right: new clinic panel).
- Backend today (`apps/api/src/routes/practitioner.ts`, `apps/api/src/queries/practitioner.ts`) only reads/writes a single `organization_id` per practitioner. `practitioner_organization` (many-to-many, `is_primary` flag, already migrated in `001_tenant_schema.sql`) and `practitioner_assignment` (per-rep primary, already migrated) both exist in schema but have zero authenticated read or write code today.
- New backend surface needed (all new routes/queries/commands, no migration):
  - `GET /api/v1/practitioner/:id` response gets a new `organizations: { organization_id, name, type, address_line1, city, is_primary, role }[]` array (global list, joined from `practitioner_organization` + `organization`), plus `my_primary_organization_id` (from `practitioner_assignment` for `ctx.user.id`, rep-only — null for admin/manager since they don't have a personal assignment row).
  - `POST /api/v1/practitioner/:id/organizations` — link practitioner to a clinic (body: `organization_id`, optional `role`). Admin/manager/rep, tenant + territory-scoped like existing practitioner writes.
  - `DELETE /api/v1/practitioner/:id/organizations/:orgId` — unlink. Same RBAC.
  - `PATCH /api/v1/practitioner/:id/organizations/:orgId/primary` — admin/manager: sets `practitioner_organization.is_primary = true` for `orgId`, `false` for all other rows for that practitioner (single-primary invariant enforced in the command, not the DB). Rep: instead upserts `practitioner_assignment (practitioner_id, user_id=ctx.user.id, primary_org_id=orgId)` — same endpoint, role-branches inside the command since the "primary" concept is role-scoped by design (see decision #1 above).
- Frontend: `hcpForm.ts`'s existing `organization_id` single-select field stays as-is (still sets the practitioner's legacy/default `organization_id`, unrelated to the new affiliation list) — no change needed there per Łukasz's earlier design call; the new multi-clinic list is a separate panel on the detail view, not a form field.
- i18n: all new labels start in `packages/i18n/en.json` (`user.hcp.detail.clinics.*` namespace) before `pl.json`/`mx.json`, per CLAUDE.md.

### Acceptance Criteria
- [x] HCP detail "Details" tab renders as two columns (`col6x2`): left = existing identity fields (email, phone, specialty, region/territory), right = clinic panel.
- [x] Right column lists all clinics the practitioner is affiliated with (name, type, address, city), each showing whether it's the practitioner's global primary.
- [x] Admin/manager can add a new clinic affiliation (select an existing `organization`) and remove one (with a confirm dialog, consistent with the existing delete-confirm pattern in this view).
- [x] Rep can add/remove affiliations too (per RBAC decision #2) — same UI, same permission level as admin/manager for affiliation CRUD.
- [x] Admin/manager can mark a clinic as the global primary (`practitioner_organization.is_primary`); setting a new primary automatically unsets the previous one.
- [x] Rep sees and can set their own primary clinic (`practitioner_assignment.primary_org_id`) independently of the global primary — the two are visually distinguished (e.g. "Primary (your visits)" vs. "Primary (default)").
- [x] If a practitioner has zero clinic affiliations, the panel shows an empty state, not an error.
- [x] Removing a clinic that is currently someone's primary clears that primary (doesn't leave a dangling reference) — for the global primary, no clinic is auto-promoted; for a rep's `practitioner_assignment`, `primary_org_id` is set to null.
- [x] All new backend writes go through `apps/api/` only (no frontend DB access), respect existing tenant/territory scoping (`assertTerritoryAccessByTerritoryId` / `getAllowedScopePaths` pattern already used elsewhere in `practitioner.ts`).
- [x] All new user-facing strings added to `packages/i18n/en.json` first, then `pl.json`/`mx.json` — no hardcoded copy (`pnpm i18n:parity` confirmed: 1600 keys in parity).
- [x] New backend routes/queries/commands and frontend panel each have tests hitting a real tenant-scoped DB (integration) and real component behavior — this ticket was explicitly reopened once already for shipping without tests/artifact (see Linear NEO-17 comment 2026-09-20), so this is a hard gate this time, not optional.
- [x] A completion Artifact with before/after visual comparison of the detail view is produced (per the repo's quality-gate hook requirement for any `.vue`/`.css` diff) — https://claude.ai/artifact/434XxBAvQ7UpTGGbGpR9a9, real screenshots also saved at `docs/worker-screenshots/NEO-17/{before,after}.png`.

### Test Coverage Map
| Acceptance Criterion | Test(s) | How verified |
|---|---|---|
| col6x2 layout (AC1) | `apps/pwa/src/views/HCPDetailView.spec.ts` › "renders the col6x2 layout — identity fields left, PractitionerClinicsPanel right" | Automated component test |
| Affiliation list with type/address/global-primary flag (AC2) | `apps/api/src/commands/practitionerOrganization.spec.ts` › `LinkPractitionerOrganizationCommand` "links a practitioner to a clinic and returns the updated affiliation list"; `apps/pwa/src/components/practitioner/PractitionerClinicsPanel.spec.ts` › "renders each affiliation's name, type chip, and address" | Automated integration + component tests |
| Admin/manager/rep add + remove affiliation (AC3, AC4) | `apps/api/src/routes/practitionerOrganization.spec.ts` › POST/DELETE round trips + kam/msl 403 cases; `apps/api/src/commands/practitionerOrganization.spec.ts` › duplicate-link `ConflictError`, missing-link `NotFoundError`; `PractitionerClinicsPanel.spec.ts` › add flow, remove-with-confirm flow | Automated integration + component tests |
| Admin/manager set global primary, unsets previous (AC5) | `commands/practitionerOrganization.spec.ts` › "admin sets the global primary and it unsets any previous global primary", "manager sets the global primary too"; `PractitionerClinicsPanel.spec.ts` › "admin can toggle the global primary star" | Automated integration + component tests |
| Rep's own primary, independent + visually distinguished (AC6) | `commands/practitionerOrganization.spec.ts` › "rep sets only their own primary_org_id", "two different reps can each have their own primary"; `PractitionerClinicsPanel.spec.ts` › "rep sees a disabled global-primary star but an enabled 'mine' star" | Automated integration + component tests |
| Empty state (AC7) | `PractitionerClinicsPanel.spec.ts` › "shows the empty state when there are no affiliations" | Automated component test |
| Removing a primary clinic clears the reference, no dangling FK (AC8) | `commands/practitionerOrganization.spec.ts` › `UnlinkPractitionerOrganizationCommand` "removes the affiliation and clears a rep's primary_org_id if it pointed at that clinic" | Automated integration test |
| Backend-only writes, territory scoping (AC9) | `commands/practitionerOrganization.spec.ts` › "denies a rep outside the practitioner's territory with ForbiddenError (first write-side use of assertTerritoryAccessByTerritoryId)" | Automated integration test |
| i18n parity, no hardcoded strings (AC10) | `node infrastructure/scripts/i18n/parity.mjs` | Script run: "OK. 1600 keys in parity across en, pl, mx.json." |
| Real-DB tests throughout (AC11) | All of the above `commands/*.spec.ts` and `routes/*.spec.ts` run against the real tenant-scoped dev Supabase via `withTenant()`, no mocked Postgres | Diff review + full suite run |
| Completion Artifact (AC12) | — | See artifact link in the Linear ticket comment once published |

Full suite runs: `apps/api` 13+10 new tests passing (`pnpm test -- src/commands/practitionerOrganization.spec.ts src/routes/practitionerOrganization.spec.ts`), full `apps/pwa` suite 48 files / 319 tests passing, full `apps/api` suite run separately to confirm no regressions elsewhere.

### Open Questions
- [ ] Can the same clinic be added twice with a different `role` value (e.g. "consultant" at one department, "attending" at another within the same organization)? Assumption for this pass: no — `practitioner_organization` already has a `UNIQUE (practitioner_id, organization_id)` constraint, so one row per clinic, `role` is just descriptive text on that one row. Flag to Łukasz if that's wrong.
- [ ] Should removing a clinic affiliation be blocked if it's referenced by existing `encounter`/`visit_plan` history at that location, or is it a soft/free removal regardless of history? Defaulting to free removal (no history dependency check) unless told otherwise — the junction table itself has no FK from encounter/visit_plan into it.

### Hand-off
→ Plan mode — scope touches new backend routes/queries/commands (`apps/api/src/routes/practitioner.ts`, `apps/api/src/queries/practitioner.ts`, new `apps/api/src/commands/practitionerOrganization.ts`), a restructured detail view (`HCPDetailView.vue`), new i18n keys, and new integration + component tests — more than 2-3 files and includes an API-contract design decision, per CLAUDE.md's Plan-mode threshold.

### Follow-up (2026-09-22, after PR #149 merged to dev)
Łukasz tested on the real pwa-dev deploy and found existing practitioners with a legacy `organization_id` (the old single-clinic field) showed a confusing empty "Clinics" panel — the new feature had no way to know about a clinic relationship that already existed via the old field, since nothing backfilled `practitioner_organization` for pre-existing data.

Fixed with `apps/api/migrations/028_practitioner_organization_backfill.sql` — backfills one `practitioner_organization` row per practitioner with a non-null `organization_id`, marked primary unless the practitioner already has one (idempotent, `ON CONFLICT DO NOTHING`). Verified live against the real shared dev DB (4 practitioners backfilled, each correctly marked primary) before also adding `apps/api/migrations/028_practitioner_organization_backfill.spec.ts` (4 tests: backfills correctly, idempotent, doesn't overwrite an existing primary, no-ops for a practitioner with no legacy clinic — exercises the migration's inner SQL directly since the automated-test "test" tenant schema isn't registered in `platform.tenants`, so the migration file's own multi-tenant loop would no-op against it).

RBAC question also raised and resolved in the same conversation: confirmed rep keeps full visibility + management, no change from the original design.
