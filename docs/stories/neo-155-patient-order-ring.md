# NEO-155 — Patient device-order ring: data source (open)

Status: **open — UI ready, no data yet.** Decision (Łukasz, 2026-09-28): the ring is driven by
`purchase_order.status`; `purchase_order` rows will be filled from OrthoApnea (OA), but *how* is
not decided yet.

## What exists

- `AppAvatar` takes `orderStatus` and draws an arc around a patient avatar, filled step by step:
  `pending → paid → processing → shipped → delivered` (`apps/pwa/src/utils/deviceOrderStage.ts`).
  `cancelled` / `refunded` / missing → no ring.
- No view passes `orderStatus` yet, so no ring is visible in the app today.

## What is missing

1. **OA → purchase_order sync.** Device orders go through OrthoApnea today
   (`apps/api/src/services/partners/orthoapnea.ts`). Their status is stored only as
   `partner_link.external_status` — a raw numeric `statusId` with no mapping in the code
   (`ORTHOAPNEA_TERMINAL_STATUSES` is empty). Nothing in the API writes `purchase_order` yet.
   Needed: the list of OA `statusId`s and what each means, then a mapping to the five
   `purchase_order.status` values above, and a decision on when to write the row (on order
   submit, on each status poll in `jobs/sync-statuses`).
2. **API read.** Patient list + detail (`apps/api/src/db/patient.ts`) should expose the latest
   non-cancelled device order's status, e.g. a `device_order_status` column via a
   `LEFT JOIN LATERAL (SELECT status FROM purchase_order WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1)`.
   Needs a real-DB test in `db/patient.spec.ts`.
3. **PWA wiring.** Pass it as `:order-status` on the patient avatars in `PatientsView.vue`
   and the patient record header.

## Open questions for Łukasz

- OA status ids and their meaning (from OA docs or their support).
- Does a patient ever have more than one live device order? (If yes: show the newest.)
