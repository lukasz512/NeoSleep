# ADR-028: Device orders go through a provider adapter, shared rules and a lab replica

## Status
Accepted (2026-10-03, CORE-95 / NEO-210). Builds on ADR-017 (partner_link / partner_transaction, no DB transaction held across a partner call). Numbered 028 because 027 is reserved by the notification-engine ADR on its own branch.

## Context

Until now the order wizard built OrthoApnea's field names in the browser and `POST /partners/orthoapnea/treatments` forwarded that body to OA as JSON, unvalidated. The live test orders of 2026-10-03 (docs/partners/orthoapnea-order-rules.md, "Results") showed:

- OA's server validates almost nothing about the device: a 3 mm advance range its own form warns about was stored as sent. **Our validation is the only guard.**
- OA's portal posts the order as `multipart/form-data` with one `treatmentDTO` JSON-string field. That shape (order 454012) was stored field for field; our JSON body was never confirmed to work.
- The DTO carries OA's own objects whole (clinic, product), a teeth JSON string, coded vertical dimension, seq1..seq6, and so on — nothing a view should know about.
- Two concurrent submits for one treatment plan could both pass the "already sent?" check and place two billable orders.

## Decision

1. **One order model, one rule set.** `packages/device-order` holds `DeviceOrder`, `DeliveryAddress`, `validateDeviceOrder`, `validateDeliveryAddress` and `RULES_VERSION`. The wizard (per step) and the API (before any partner call) run the same functions. Every rule cites the OA rule it mirrors.
2. **Provider adapter.** `routes/deviceOrders.ts` depends only on `DeviceOrderProvider` (`services/deviceOrders/provider.ts`: `minDesiredDate`, `submitOrder`). The OrthoApnea implementation (`services/deviceOrders/orthoapnea/`) gathers OA's objects and calls the pure mapper `toOaTreatmentDto(order, ctx)`; `services/partners/orthoapnea.ts` stays the transport (session, mutation queue, partner_transaction log). A future real OA API, or a second lab, is a second implementation — the route and the rules don't change.
3. **Validate first, send second.** `POST /api/v1/device-orders` answers `400 { error: "validation", fields, warnings, rulesVersion }` before any lab call. Delivery always goes to the ordering doctor's primary HCO (NEO-213).
4. **One order per plan, enforced in the DB.** The submit claim is a single conditional upsert on `partner_link` (`claimPartnerLink`: insert as `pending`, or flip `failed` → `pending`; nothing returned if the link is synced or already pending) under `pg_advisory_xact_lock` keyed by the plan. A second caller gets 409 before touching OA (no OA patient either — the patient is ensured after the claim). On a treatment_plan link `pending` means "submit running or interrupted"; a link left pending by a timeout or crash is never retried automatically. No new status value, so no migration.
5. **Audit.** Every order writes `audit_log` (`PartnerOrder`) with the acting user, `rulesVersion`, our order and the exact DTO; `partner_transaction` keeps the request/response pair (ADR-017).
6. **Lab replica for tests.** `apps/api/test/oa-replica/server.ts` is an in-process, stateful `node:http` replica of the OA endpoints we use, built from scrubbed live captures (`fixtures/`). It enforces multipart, requires a known patient, answers like the captured order (statusId 1, upper-cased address, price) and has `failNext` / `delayNext` controls. Specs point the service at it with `__setOrthoApneaBaseUrlForTests` (env.ts reads the base URL once at import). A vitest setupFile (`test/fetch-guard.ts`) rejects any fetch to an `apneadock` host, because a local run sources the real credentials from `.env`. A contract test pins `toOaTreatmentDto` against the DTO OA accepted.

### Reconcile (Łukasz D3, 2026-10-03)

A `pending` treatment_plan link older than `RECONCILE_AFTER_MS` (10 min, `services/partners/orthoapnea.ts`) is no longer a 409 forever. The next submit first asks OA, read-only, `GET /api/treatments/byPatient/{oaPatientId}?page=&size=50` (a Spring page of full treatment DTOs) for an order with the same product code and a `requestDate` no earlier than the link's last update minus 1 minute, not already linked to another plan. OA writes `requestDate` in Spanish local time with no zone (`OA_SERVER_TIME_ZONE = "Europe/Madrid"`, measured on shot S3), so it is converted before the comparison.

- Found: the link is synced to that order, a `partner_transaction` row `reconcile` keeps OA's DTO, and the answer is 409 `ALREADY_SUBMITTED` with the order id.
- Not found (or no OA patient was ever created): the link is marked `failed` (row `reconcile`, `not_found`) and re-claimed in the same locked transaction, so the doctor's click sends the order exactly once.
- OA unreachable: the link stays `pending` (row `reconcile`, failed) and the answer stays 409 `SUBMISSION_PENDING`.
- Younger than 10 minutes: 409 `SUBMISSION_PENDING` without asking OA (a submit may still be running).

The outcome is written only if the link is unchanged since it was read (same `updated_at`, still `pending`), under the plan's advisory lock, so two racing submits can't both re-claim it.

### Warnings need confirmation (Łukasz D1, 2026-10-03)

OA's form only warns about an advance range under 5 mm, and OA's server accepts it. We keep the warning and add a confirmation: `DeviceOrder.acknowledgedWarnings` lists the warning codes the doctor confirmed (the wizard's "I confirm the advance range below 5 mm" checkbox). A confirmable warning (`CONFIRMABLE_WARNINGS`) without its confirmation is an error, `warningNotConfirmed`, in the shared rules — so the API enforces it too. The confirmation is audited with the order; the wizard drops it when the warning goes away, so a new range under 5 mm needs a new one.

### Registration (Łukasz D2, 2026-10-03)

`DeviceOrder.registration` carries the "Registro dental" choice: impression, a scanner (OA enum `ba`) or a scanner platform (OA enum `bZ`), as OA's enum names. The adapter sends `scannerTreatment` / `scannerPlatform` with the other one null, as OA's form does. The promotion code is never shown nor sent.

### Reconciliation (NEO-218, 2026-10-03)

Admins need to see, continuously, whether our orders and the lab's are the same orders, in the same number, and the reason for any difference. The provider interface gains three members, so a future real OA API (or a second lab) plugs in the same way:

- `listRemoteOrders()`: a read-only list of every order on the account. For OA, the adapter reads `GET /api/treatments/DTO?treatmentSearchForm={}` page by page.
- `comparedPaths`: the wire-format fields we send, which the lab stores back. They were confirmed field for field on order 454012.
- `comparedDatePaths`: the subset compared by day only.

`services/deviceOrders/reconcile.ts` compares these fields against our stored request payload (`partner_transaction`). It is pure and has no lab field names. Values are normalised the way the lab stores them (upper-cased and trimmed text, `1.0` = `1`), so OA's normalisation is never reported as drift.

A lab that can't be read gives a `failed` run, never a list of "missing" orders. The lab's status is shown but is not a mismatch; tracking (CORE-67) owns status.

An environment tag on the last line of the order notes (`[NeoSleep PROD · ref …] — referencia interna NeoSleep, no requiere acción`, approved by Łukasz 2026-10-03) lets a lab-only order be attributed to dev or prod. An untagged lab-only order (older than the tag) is `outside` on prod and `unknown_env` elsewhere. The daily job has its own secret (RECONCILIATION_JOB_SECRET), separate from the shared job secret.

## Consequences

- Arbitrary bodies can no longer reach OA: the old pass-through route answers 410.
- Changing a rule means changing `packages/device-order` and bumping `RULES_VERSION`; every stored order says which version it passed.
- The replica only knows what we captured. When OA behaves differently live (new required field, different error), capture it, scrub it into `fixtures/`, and teach the replica — not the other way round.
- An interrupted submit resolves itself on the next submit after 10 minutes (Reconcile above). It still needs a person only when OA stays unreachable, or when the order was placed for another product.
- The `POST /partners/orthoapnea/patients/:id/ensure` route still exists; its own create is not guarded against concurrent calls (a duplicate OA patient is harmless to billing, unlike a duplicate order).
