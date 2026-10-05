# API Contract – v1 draft

Base: `/api`

## Auth
- `GET /api/health` – health check
- `GET /api/auth/session` – current session
- `POST /api/auth/logout`

## Tenant config
- `GET /api/tenant/config` – resolved tenant-config (cached, versioned)

## App config (theme / branding)
- `GET /api/config/app` – app-wide theme and branding (primary_color, secondary_color, border_radius, logo_url). Shared by website and rep-app. Source: `app_config`. See foundation/docs/BRAND_AND_APP_CONFIG.md.

## CRM data
- `GET /api/leads?query=&region=` – list
- `GET /api/leads/:id` – details
- `GET /api/hcp?query=` – list
- `GET /api/hcp/:id` – details
- `GET /api/hco?query=` – list
- `GET /api/hco/:id` – details

## Meetings / PCF
- `POST /api/meetings` – start meeting
- `PATCH /api/meetings/:id/stop` – stop meeting
- `POST /api/pcf-submissions` – submit PCF (online) / accept queued sync

## Content
- `GET /api/content` – list presentations
- `GET /api/content/:id` – metadata
- `GET /api/content/:id/file` – pdf (cacheable)

## Partner: OrthoApnea
- `GET /api/v1/partners/orthoapnea/status` – `{ connected, attemptsExhausted, reason? }`; `reason` ∈ `not_configured | credentials_rejected | unreachable | timeout | unexpected_response` (set only when not connected)
- `GET /api/v1/partners/orthoapnea/resources?locale=` – `{ resources: [...], mediaToken }`; each `mediaUrl` is relative to the API
- `GET /api/v1/partners/orthoapnea/resources/:id/media?locale=&lang=&t=<mediaToken>` – streams the file; auth by Bearer or `?t=` media token (ADR-020 addendum); forwards `Range` → `206` + `Content-Range`, capped at 8 MiB per response (Cloud Run refuses non-streamed responses over 32 MiB, and Chrome opens video with `bytes=0-`; the player fetches the next slice itself); always `Accept-Ranges: bytes`; `Cross-Origin-Resource-Policy: cross-origin`

- `POST /api/v1/partners/orthoapnea/treatments` – **410 Gone** (CORE-95). It passed the client's body to OrthoApnea unvalidated; orders go through `POST /api/v1/device-orders`.

## Device orders (CORE-95, ADR-028)
Roles: `admin`, `doctor`, `manager` (reps/KAMs/MSLs get 403 — NEO-199). The order body is our own `DeviceOrder` (`packages/device-order`); the lab's wire format never appears in this API.

- `GET /api/v1/device-orders/context?dentist_id=<practitioner uuid>&product_code=002|003` →
  `200 { delivery: { organizationId, name, address, city, postalCode, countryCode, phone, email } | null, deliveryIssues: OrderIssue[], minDesiredDate: "YYYY-MM-DD" | null, rulesVersion }`.
  `delivery` is the dentist's primary HCO (`practitioner_organization.is_primary`, else their only affiliation, else `null` with `deliveryIssues: [{ path: "delivery", code: "required" }]`). Missing HCO fields come back as `delivery.<field>` issues. `minDesiredDate` is OrthoApnea's manufacturing date for the product (cached 10 min); `null` when OA can't be reached — the endpoint still answers.
- `POST /api/v1/device-orders` body `{ treatment_plan_id: uuid, patient_id: uuid, order: DeviceOrder }`:
  - `201 { externalId, externalStatus, warnings: OrderIssue[] }` — sent; `partner_link` synced; an `audit_log` row (`entity_type: "PartnerOrder"`, `entity_id` = plan) holds the acting user, `rulesVersion`, our order, the delivery address and the exact DTO sent.
  - `400 { error: "validation", fields: OrderIssue[], warnings: OrderIssue[], rulesVersion }` — nothing was sent to the lab. Checked in this order: ids, plan (must be the patient's `dental_appliance` plan), `validateDeviceOrder`, `validateDeliveryAddress` on the dentist's primary HCO — all with **no** lab call; then the desired date against the lab's minimum (one read call, `desiredDateTooEarly`).
  - `409 { code: "PARTNER_ORDER_ALREADY_SUBMITTED", externalId }` — this plan already has an order (`externalId` = the lab's order id). `409 { code: "PARTNER_ORDER_SUBMISSION_PENDING" }` — another submit is running, or one was interrupted (timeout / crash) less than 10 min ago (`RECONCILE_AFTER_MS`), or the lab couldn't be asked. An interrupted submit older than that is first looked up in the lab (read-only `GET /api/treatments/byPatient/{oaPatientId}`, same product, `requestDate` ≥ claim − 1 min): found → the link is synced to it and the answer is `ALREADY_SUBMITTED`; not found → this request sends the order once (`201`). Each lookup leaves a `partner_transaction` row with `action: "reconcile"`.
  - `502 { code: "PARTNER_SERVICE_ERROR" }` — the lab refused or was unreachable; the link is `failed` and the same body can be sent again.
  - `OrderIssue` = `{ path, code, params? }`; `path` is a dot path into `DeviceOrder` (or `delivery.<field>`, `treatment_plan_id`, `patient_id`), `code` is the i18n key suffix `app.deviceOrder.errors.<code>`.
  - `DeviceOrder` fields added 2026-10-03 (`RULES_VERSION` `2026-10-03.2`), both optional on input:
    - `acknowledgedWarnings: string[]` (default `[]`) — warning codes the doctor confirmed. A confirmable warning (`advanceUnder5`, MP − MR under 5 mm) not listed here is a `400` error `{ path: "protrusionMaxMm", code: "warningNotConfirmed", params: { warning: "advanceUnder5" } }`; once listed, only the warning is returned.
    - `registration` (default `{ method: "impression" }`) — `{ method: "impression" } | { method: "scanner", scannerTreatment } | { method: "platform", scannerPlatform }`, names from OA's enums (`SCANNER_TREATMENTS` / `SCANNER_PLATFORMS` in `@neo/device-order`). A missing name is `required`, an unknown one `invalid` (`registration.scannerTreatment` / `registration.scannerPlatform`). Sent to OA as `scannerTreatment` / `scannerPlatform`, the other one `null`. No promotion code is ever sent.
  - The order is stored and sent as parsed (defaults filled, unknown keys dropped).

### Reconciliation (NEO-218)
Compares the orders this environment sent (`partner_link` + the payload of its `create_treatment` call) with the lab's order list, read through the lab's own list endpoint with GET only. Runs are stored in `device_order_reconciliation_run` and kept for 90 days. `ReconciliationItem.reason` takes these values:
- Mismatches: `missing_in_lab`, `field_drift` (with `drift: [{ field, ours, lab }]`), `untracked` (the lab order carries this environment's tag but has no link here), `submission_pending`.
- Info: `test_order`, `other_env`, `unknown_env`, `outside` (placed directly in the lab).
- Plus `matched`.

The lab's status is reported as `labStatus` and is never a mismatch.

- `POST /api/v1/device-orders/reconciliation/run` (**admin**) → `201 { environment, run }`, where `run` = `{ id, provider, trigger: "manual", triggered_by, status: "ok"|"mismatch"|"failed", summary: { oursSent, labTotal, matched, mismatches, info, byReason, matchLevel }, items: ReconciliationItem[], error, started_at, finished_at }`. When the lab can't be read, `status: "failed"`, `items: []` and `error` is set. A manual run sends no email.
- `GET /api/v1/device-orders/reconciliation/latest` (**admin, manager**) → `200 { environment, counter: { status, matchLevel, matched, mismatches, finishedAt } | null, run? }`. Only admins get `run`, and each admin read writes an `audit_log` row (`action: "read"`, `entity_type: "DeviceOrderReconciliation"`) because items carry the lab's patient names. A manager gets the counter only (Łukasz Q3).
- `GET /api/v1/device-orders/reconciliation/runs?limit=30` (**admin**, max 100) → `{ items: run summaries without items }`.
- `POST /api/v1/device-orders/jobs/reconcile` (machine-to-machine, `Authorization: Bearer <RECONCILIATION_JOB_SECRET>`, its own secret, Łukasz D2 — the shared job secret is refused): the daily job (`.github/workflows/device-order-reconciliation.yml`, 07:00 Mexico City). Runs for the default tenant and every tenant with a device-order link → `{ tenants: { <slug>: { status, runId } | { error } }, tenantsFailed }`. A scheduled run with `mismatch` or `failed` emails the active admins counts and lab order numbers only, with no patient data (Łukasz Q1).
- Environment tag: the last line of every new order's notes is `[NeoSleep DEV|PROD|LOCAL · ref <first 8 hex of the plan id>] — referencia interna NeoSleep, no requiere acción` (`DEPLOY_ENV`; wording approved by Łukasz 2026-10-03, D1).

## Problem reports + production errors (CORE-141)
Story: `docs/stories/report-problem-and-admin-issues.md`. Both tables live in the `platform` schema (`problem_report`, `diagnostics`), scoped by `tenant_slug`. A platform admin is an active `platform.users` row with role `owner`/`admin` whose email matches the signed-in user.
- `POST /api/v1/problem-reports` (any signed-in user, 5 per hour → `429`): multipart (optional `file` ≤ 5 MB, `image/*` or PDF) or JSON. Fields `kind` (`problem`|`suggestion`|`other`), `description` (10–5000), `page_url` (query and fragment stripped), `app_version`, `viewport`, `request_ids` (≤ 20), `recent_errors` (≤ 10 flat objects, ≤ 20 KB). The reporter comes from the token → `201 { id, number }`. It emails `RESEND_NOTIFY_TO` the number, kind, tenant, reporter and page, never the description. Trackable reports (`docs/stories/trackable-feedback-reports.md`): the reporter also gets an in-app `problem_report_received` and a receipt email in their language, and the tenant's admins get an in-app `problem_report_new`.
- `GET /api/v1/problem-reports/mine` (any signed-in user, own reports in this tenant, newest 100) → `{ items: [{ id, number, kind, description, status, tracker_ref, reporter_reply, resolved_at, created_at, updated_at }] }`, with no internal note and no captured context.
- `GET /api/v1/admin/issues/access` (**admin**) → `{ platformAdmin }`.
- `GET /api/v1/admin/problem-reports?status=new|in_progress|resolved|dismissed|all` (**admin**, own tenant, newest 200) → `{ items }`, with no storage path and with `has_attachment`.
- `PATCH /api/v1/admin/problem-reports/:id` (**admin**, own tenant) `{ status?, admin_note?, tracker_ref?, reporter_reply? }` → row. `resolved_at` is set on `resolved` and cleared otherwise. `tracker_ref` is a ticket key like `CORE-123` (upper-cased; `""`/`null` clears it; anything else → `400`). `reporter_reply` (≤ 1000, PHI-free) is what the reporter reads; `admin_note` stays internal. A real status change notifies the reporter: `in_progress` in-app only, `resolved`/`dismissed` in-app plus an email with the ticket and reply.
- `GET /api/v1/admin/problem-reports/:id/attachment` (**admin**, own tenant) → `{ url }`, signed for 300 s.
- `GET /api/v1/admin/diagnostics?status=open|resolved|dismissed|all&env=&level=` (**admin + platform admin**) → `{ items }`. These are errors grouped by (env, source, normalised message hash), with `count`, `first_seen`, `last_seen` and `linked_reports [{ id, number }]` matched by `request_id`.
- `PATCH /api/v1/admin/diagnostics/:id` (**admin + platform admin**) `{ status }` → `{ id, status }`. A resolved error that recurs reopens; a dismissed one keeps counting but stays dismissed. The first occurrence of an `error`/`fatal` kind in `production` emails `RESEND_NOTIFY_TO`, at most 20 such emails per hour per process.

## Planner events (calendar)
- `GET /api/events?start=&end=&region=` – list events (filtered by rep/region)
- `GET /api/events/:id` – event detail with attendees
- `POST /api/events` – create event (title, start_at, end_at, type, status, location, video_link, notes, region, attendees)
- `PATCH /api/events/:id` – update event

## Events / analytics
- `POST /api/events` – batch events (slide tracking, ui events) – *note: conflicts with planner; consider `/api/analytics/events`*

## AI
- `POST /api/ai/rep-copilot` – Q&A
- `POST /api/ai/pcf-draft` – draft PCF fields from transcript/context

Notes:
- RBAC/region enforced on every endpoint.
- Event payloads are redacted; never store secrets or raw PHI in logs.
