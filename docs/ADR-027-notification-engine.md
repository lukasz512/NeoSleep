# ADR-027: Notification Engine — catalog, preferences, scheduled delivery

## Status
Proposed (2026-09-27, NEO-133). Extends [ADR-012](ADR-012-notification-center.md) and does not replace it: the inbox model, identity scoping and the category/opt-out table stay as they are.

## Context
ADR-012 shipped the inbox: `notification` (one row per event) + `notification_delivery` (one row per channel attempt). Since then:
- There are two producers (OrthoApnea sync, appointments). Both write title and body text directly into `notification`, and they don't agree on the format.
- Nothing writes to `notification_delivery`. Web push is never sent, and email is never linked.
- There is no clock. Reminders, escalation, digests and retention all need one.
- Łukasz scoped the Notifications epic in two decision rounds (see `docs/stories/notifications-epic.md`). Those answers require preferences, quiet hours, escalation, grouping and a digest, all of which need a central place to apply them.

## Decision

### 1. A typed event catalog in code (not a DB table)
`apps/api/src/notifications/catalog.ts` holds one entry per `notification.type`:

| Field | Purpose |
|---|---|
| `category` | `security` · `legal` · `operational` · `marketing` (ADR-012 table decides opt-out) |
| `defaultChannels` | e.g. `['in_app','push']`. Email usually comes only via escalation |
| `priority` | `normal` · `high`. **Operational only** (time-based); never derived from clinical values |
| `escalateAfterMin` | e.g. 30 for important items, `null` otherwise |
| `i18n` | keys for the PHI-free title/body per channel (`push`, `email`, `in_app`) |
| `link(entity)` | deep link builder (`/patients/:id`, `/appointments/:id`, …) |
| `groupKey` | usually `(type, entity_type, entity_id)` |
| `recipients(ctx)` | role- and territory-aware resolver (treating doctor, region manager, owning rep …) |

Code rather than a table because types change together with code (producers, links, tests). A tenant can't invent a type without code anyway, and ADR-012 §4 already keeps `type` as a CHECK constraint. Tenant control happens through **preferences**, not through the catalog.

### 2. One entry point: `notify()`
```
notify({ type, entity, vars, actorId? })
  → catalog lookup
  → recipients(ctx)                       // identities
  → for each recipient:
       upsert inbox row (group within 5 min on groupKey → bump count)
       for each channel in resolvePreferences(recipient, category):
         insert notification_delivery (status='pending', not_before = quietHoursEnd | now)
```
Producers never write `notification` directly again. `notify()` runs inside the producer's transaction (`withTenant`), so a rolled-back booking never notifies anyone.

### 3. Preferences
A new table, `notification_preference (identity_id, category, channel, enabled)`, plus per-identity `quiet_from`, `quiet_to`, `time_zone`, `digest_enabled`, `digest_time`.

Resolution order: **user row → tenant default (`app_config.notification_defaults`) → catalog default**.
- `security` and `legal` are locked: PUT rejects disabling them, and they ignore quiet hours.
- In-app is always on. It is the record of truth, and the bell never goes silent.
- Quiet hours default to 21:00–07:00 in the user's time zone. A deferred delivery gets `not_before` = end of the window. It is not dropped.

### 4. Delivery worker + scheduler
`POST /api/v1/internal/jobs/notifications/tick` is guarded by `requireInternalJobSecret` (the same pattern as the OrthoApnea sync). Google Cloud Scheduler calls it every 5 min. For each tenant schema it:
1. **Sends** due `pending` deliveries (`not_before <= now()`), using `FOR UPDATE SKIP LOCKED` so overlapping ticks are safe. It retries with backoff (1, 5, 30 min, then `failed`) and stores `provider_message_id` and `failed_reason`.
2. **Escalates**: an inbox row with `escalateAfterMin` that is unread after that time and has no email delivery yet gets an email delivery. It runs exactly once, guarded by a unique `(notification_id, channel)`.
3. **Runs time-based producers**: appointment reminders (24 h / 2 h, idempotent per `(appointment, offset)`), the lead-neglected and lead-unassigned checks, and the morning digest (per user, at local `digest_time`, Mon–Fri, skipped when empty).
4. **Purges**: read rows after 90 days, unread rows after 180 days, `notification_delivery` after 1 year. Notifications are not clinical records (ADR-012), so these are hard deletes.

Why Cloud Scheduler: it is nearly free, lives in the GCP project that already hosts the API (ADR-025), and is more reliable than GitHub Actions cron, which is delayed or skipped under load. The endpoint is plain HTTP, so it works the same on Render until prod moves.

### 5. Channel adapters
Each channel has a small `send(delivery) → {status, providerId}` adapter behind one interface:
- `in_app`: no-op (the row already exists). It marks the delivery `delivered`.
- `push`: VAPID web push to every subscription of the identity. A 404/410 response deletes the subscription. `push_subscription` moves to `identity_id` and becomes tenant-scoped (NEO-138).
- `email`: one generic `@neo/email` template (type headline + "Open in NeoSleep"), with a grouped variant, via Resend.
- `whatsapp`, `sms`: later (NEO-148/149). Patient channels check `consent` per channel and log `skipped_no_consent` when it is missing.

### 6. PHI rule, enforced by tests
Anything leaving the app (push, email, SMS, WhatsApp) may contain only the event type, counts, time, clinic and the doctor's name (for patient reminders). It must never contain a patient's name, diagnosis, study type or clinical value. The catalog test renders every type with fixture data containing a sentinel patient name and asserts that the name does not appear in any non-in-app payload. In-app text can be richer, because it is shown only after login.

### 7. Explicitly not doing
- **Automatic clinical priority** (e.g. from AHI): this is clinical decision support, which makes the app SaMD (MDR IIa). A manual urgent flag set by a person is NEO-150.
- **WebSocket/SSE**: ADR-012 §3 still holds. Polling plus push nudges is enough at this volume.
- **Tenant-specific templates**: v1 only lets tenants change defaults.
- **An external notification SaaS** (Novu, Knock): the engine is small, the data is PHI-adjacent, and one more processor would need a DPA. Revisit if channels multiply.

## Consequences
- Producers become one-liners (`notify({type:'appointment_booked', entity})`), and every notification gets the same rules.
- One more table, `notification_preference`, plus columns on `notification` (`priority`, `group_count`) and on `notification_delivery` (`not_before`, `attempts`), all in new numbered migrations.
- The scheduler is new infrastructure and needs its own runbook (secret rotation, pause/resume, how to replay a failed tick).
- Tests must run on a real Postgres (CLAUDE.md rule 5), especially for `SKIP LOCKED` and time-zone logic.

## Compliance Impact
- PHI minimisation outside the app is enforced by tests (§6), not by convention.
- Patient sends are consent-gated per channel (NEO-146). The consent management UI is a separate epic (Consents & Privacy).
- Retention (§4.4) is documented and automated. The delivery log is kept 1 year as an audit trail of who was told what, when, and through which channel.
- The locked categories follow the ADR-012 opt-out table. Add a new type to that table before shipping it.
