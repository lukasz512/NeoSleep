## Refined User Story: Device order reconciliation (NeoSleep ↔ OrthoApnea)

**Classification**: feature. It adds a new admin view, a scheduled job and a migration, and changes the text OA can see on our orders.
**Raw input** (Łukasz, 2026-10-03, PL): "As an admin I need a view of these orders. Are they the same (do ours match OA's; if not, why)? Does the number of orders placed with us match what OA shows? We need to check this continuously. Make a report from it once a day, and also, on a button click in the panel as admin, I want to see the level of 'match' between the platforms. We have to be sure it works."

### As an admin, I want to see on demand and every day whether NeoSleep's device orders match OrthoApnea's, and why they don't, so that I can trust the integration and catch a lost or altered order before it reaches a patient

### Stakeholder Notes
- 👤 User: Admins (Łukasz/ops) today can only check by logging into apneadock and comparing by hand. Managers get a match counter only (Q3).
- 🏢 Client: An order that was lost or silently changed means a delayed or wrong device for the clinic. Proof that what we sent is what OA built supports the partner relationship.
- 🩺 Patient: Indirect but real. A field drift (e.g. advance mm, splint sequence) means the wrong device geometry, and a lost order delays therapy. Field drift is therefore the most important finding.
- 🚀 NeoCRM/Platform: Reconciliation runs over the `DeviceOrderProvider` interface (ADR 028). The OA adapter supplies "list remote orders", so a future real OA API or another lab plugs in the same way.
- ⚖️ Compliance: The report shows OA order data, including the patient name, so it is admin-only (Q3: managers see counts only). The daily email carries counts and order numbers, no patient data (same PHI-free rule as notifications, ADR 027). Every report view is audited.

### Medical-Industry Trend Check
- n/a: internal integration-integrity tooling.

### Decisions (Łukasz, form neo218-r1, 2026-10-03)
- Q1: email admins only on a mismatch or a failed run; the report is always in the admin panel.
- Q2: OA-only orders are shown with a reason (placed outside NeoSleep / other environment / unknown environment / test order). "Pin to patient" is split into NEO-219.
- Q3: admins get the full view, managers only the match counter.
- Q4: pwa-dev reads live OA (GET only). Every new order gets an environment tag (DEV/PROD + our order number) in its OA observations; Łukasz approves the exact OA-visible wording before deploy.

### Acceptance Criteria — decided by default, a test proves each
- [ ] Match key is the OA treatment id stored in `partner_link.external_id`. A pending submit without an id is matched by OA patient + request time, as in the D3 reconcile.
- [ ] Only fields we send are compared, against the stored `partner_transaction.request_payload`. OA normalisation (upper-cased address, trimmed whitespace) is not a drift.
- [ ] Every non-match carries a reason code: `missing_in_oa`, `only_in_oa_outside`, `only_in_oa_other_env`, `only_in_oa_unknown_env`, `test_order`, `field_drift` (with field, ours, OA's) or `submission_pending`.
- [ ] OA status is shown per order but never counted as a mismatch.
- [ ] The summary shows: ours sent, OA total, matched, mismatches by reason, match level %.
- [ ] OA unreachable or a non-2xx response → the run is stored as `failed` with the error, and no mismatches are reported.
- [ ] Only GET requests reach OA; the replica test fails on anything else. All list pages are read.
- [ ] "Sprawdź teraz" (admin only) runs a reconciliation and shows the result. A manager sees only the match counter; a rep gets 403.
- [ ] The daily run happens at 07:00 America/Mexico_City (GitHub Actions cron → internal endpoint with a service token). The token is never in the frontend.
- [ ] A run with mismatches or a failure emails the admins (counts + OA order numbers, no patient data). A clean run sends nothing.
- [ ] Runs are stored for 90 days, then pruned.
- [ ] New orders carry the environment tag line in `observations` (approved 2026-10-03, D1: tag + "— referencia interna NeoSleep, no requiere acción").
- [ ] Tests use only the in-repo OA replica; there is no live OA in CI.

### Open Questions
- none. Default decided 2026-10-03 when the neo218-r1 thread got no other answer: an OA order without an environment tag that isn't linked in this environment's DB is `only_in_oa_unknown_env`, not `only_in_oa_outside`. A test covers this.

### Hand-off
→ `/arch assess device-order-reconciliation` — new migration (reconciliation run table), provider interface extension, internal scheduled endpoint.
