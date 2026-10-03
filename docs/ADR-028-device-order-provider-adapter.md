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

## Consequences

- Arbitrary bodies can no longer reach OA: the old pass-through route answers 410.
- Changing a rule means changing `packages/device-order` and bumping `RULES_VERSION`; every stored order says which version it passed.
- The replica only knows what we captured. When OA behaves differently live (new required field, different error), capture it, scrub it into `fixtures/`, and teach the replica — not the other way round.
- An interrupted submit needs a person: check OA for the order, then set the `partner_link` to `synced` (with its id) or `failed`. There is no UI for that yet.
- The `POST /partners/orthoapnea/patients/:id/ensure` route still exists; its own create is not guarded against concurrent calls (a duplicate OA patient is harmless to billing, unlike a duplicate order).
