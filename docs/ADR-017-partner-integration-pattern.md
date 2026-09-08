# ADR-017: Generic partner-integration schema, and decoupling partner HTTP calls from DB transactions

## Status
Accepted

## Context
OrthoApnea (apneadock.es) is the first of at least 3 planned third-party partner
integrations (device/appliance vendors reps order through, mirroring a local
order into the partner's own system). Two problems needed solving before the
next one gets built:

**1. Schema shape.** The natural-looking design — a `orthoapnea_patient_id`
column on `patient`, an `orthoapnea_treatment_id` + `orthoapnea_status` on
`treatment_plan` — hardcodes one partner's name onto core clinical tables.
Every future partner would repeat the same columns under a different prefix,
and `patient`/`treatment_plan` (FHIR-aligned, partner-agnostic per this
project's own architecture) would accumulate integration-specific noise
indefinitely.

**2. Transaction/HTTP coupling.** The initial implementation wrapped an entire
partner operation — local DB reads, the OrthoApnea HTTP round-trip itself, and
the resulting DB writes — inside one `withTenant()` call, i.e. one Postgres
transaction holding one pooled connection open for the full duration of a
third-party network request. `SyncOrthoApneaTreatmentStatusesCommand` made
this worse: it looped over every linked treatment_plan inside a SINGLE such
transaction, so N treatments meant one connection held for N sequential
OrthoApnea round-trips. A slow or hung OrthoApnea response didn't just delay
the request — it pinned a connection out of pool (`max: 25`, see
`db/connection.ts`), and the sync job made that failure mode scale with the
number of linked orders instead of staying bounded to one request.

## Decision

**Generic `partner_link` / `partner_transaction` schema** (migration `018_partner_link.sql`):
- `partner_link` is a current-state pointer, keyed by `(partner, entity_type, entity_id)` —
  e.g. `('orthoapnea', 'patient', <patient.id>)` or `('orthoapnea', 'treatment_plan', <plan.id>)`.
  Holds `external_id`, `external_status`, `sync_status` ('pending'/'synced'/'failed'), `last_error`.
- `partner_transaction` is an append-only audit log, one row per API call made
  for a given link: `action`, `request_payload`, `response_payload`,
  `http_status`, `success`, `validation_report` (see
  `services/partners/orthoapnea.ts`'s `validatePartnerResponse` — flags fields
  a partner silently renamed/removed/added, since this integration, like most
  reverse-engineered partner APIs, has no official contract to pin against).

No `tenant_id`-style per-partner column ever lands on `patient`, `treatment_plan`,
or any other clinical table. `entity_type` + `entity_id` is a generic
polymorphic reference, exactly like `note`'s and `audit_log`'s existing
pattern in this schema — a new partner is a new `partner` string value and a
new `services/partners/<name>.ts` file, never a migration touching core
tables.

**Decoupling the HTTP call from the DB transaction.** Every partner service
function that does "read/prepare local state → call the partner API → record
the outcome" (`ensureOrthoApneaPatient`, `createOrthoApneaTreatment`,
`addOrthoApneaComment`, `fetchOrthoApneaTreatmentStatus`) now takes a
`tenantSlug: string` instead of a `PoolClient`, and runs three phases:

1. A short `withTenant()` transaction — read/create the `partner_link` row
   and whatever local data the request payload needs. Commits and releases
   the connection before returning.
2. The partner HTTP call itself, with **no transaction open** — just a plain
   `await fetch(...)` (via `authedFetch`, now with a 20s `AbortController`
   timeout — a hung connection no longer blocks indefinitely, independent of
   the transaction fix).
3. A second short `withTenant()` transaction — write the `partner_transaction`
   row and update `partner_link`'s status. Commits and releases.

`SyncOrthoApneaTreatmentStatusesCommand` follows the same shape at the loop
level: one short transaction to fetch the worklist, then per link the
external call runs with no transaction open, and only the local
plan-lookup/notification/audit-log write after a status change is wrapped in
its own short transaction. The new
`SyncOrthoApneaTreatmentStatusesAllTenantsCommand` (see below) adds an outer
per-tenant loop on top of this — still no transaction spans more than one
tenant's local write.

Routes were updated to match: `buildContext()` (session/token_version
verification) is its own short `withTenant()` call, then the service function
is called with the tenant slug directly, then any audit-log write after it is
its own short transaction — never nested inside the service call.

**Multi-tenant job dispatch.** The status-sync job route
(`POST /partners/orthoapnea/jobs/sync-statuses`, machine-to-machine via
`requireInternalJobSecret`) used `tenantSlugFromHost()` to pick a tenant —
that helper is a documented single-tenant stub (ADR-002: tenant is chosen at
login, not by subdomain) that always resolves to `DEFAULT_TENANT_SLUG`. For a
cron-triggered job with no request host to speak of, that meant the sync job
silently ran for exactly one tenant, forever, no matter how many tenants
exist. `SyncOrthoApneaTreatmentStatusesAllTenantsCommand` now queries
`platform.tenants` directly (`getActiveTenantSlugs()`, `db/tenant.ts`) for
every `status = 'active'` slug and runs the per-tenant sync for each,
catching and recording failures per tenant so one tenant's outage or bad data
can't abort the rest. This fix is scoped narrowly to this one job route —
`tenantSlugFromHost()` itself is unchanged, since fixing it for session-based
routes is a separate, larger auth/routing decision.

## Consequences
- A pooled connection is never held for the duration of a third-party HTTP
  call, for either a single order submission or the N-iteration sync job —
  the failure mode "OrthoApnea is slow" can no longer degrade into "the
  connection pool is exhausted."
- Every partner service function's public signature changed from
  `(client: PoolClient, ...)` to `(tenantSlug: string, ...)`. Existing
  integration tests (`orthoapnea-order.spec.ts`) needed restructuring: local
  fixture setup (creating a test patient/plan) must now happen in its own
  transaction that actually commits before the service function runs,
  since the service function opens an independent connection that can't see
  another transaction's uncommitted writes (READ COMMITTED isolation) — this
  is a direct, intended consequence of the fix, not a workaround.
- The status-sync job now genuinely covers every active tenant
  (`fourseasons`, currently `status = 'provisioning'`, is correctly excluded
  until it goes active) instead of silently only ever syncing one.
- This `partner_link`/`partner_transaction` shape, the three-phase
  transaction pattern, and the `services/partners/<name>.ts` file convention
  are the template for the next 3+ planned partner integrations — a new
  partner should not need a new migration touching `patient`/`treatment_plan`,
  and should not reintroduce a transaction spanning an external HTTP call.
- Every `partner_transaction` write now also emits a structured `console.log`
  (action / link id / success / http status) at the point it's recorded, so a
  manual test session can watch these happen live in server logs — added
  alongside the new admin-only transaction-log UI that reads this same table
  (`GET /partners/orthoapnea/treatments/:id/transactions`).
