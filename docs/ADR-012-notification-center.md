# ADR-012: Notification Center — in-app inbox, multi-channel fan-out, identity-scoped

## Status
Accepted

## Context
The rep app needed a top-bar bell with an unread badge, a dropdown list (All/Unread), and — per the wider ask — a foundation that can eventually push the same event to email and (already built) web push, for any identity type (`users` today, `practitioner`/`patient` once those portals ship — see `docs/foundation/` deferred-portal notes).

The schema already anticipated this: `001_tenant_schema.sql` shipped a `notification` table (`user_id`, `type`, `channel`, `title`, `body`, `entity_type`/`entity_id`, `action_url`, `read_at`, `metadata`) and a `push_subscription` table, plus `app_config.notification_defaults JSONB` for tenant-level channel defaults. None of it had a query/command layer or a UI yet.

Two problems surfaced while building on top of this:

1. **`push_subscription` schema/code mismatch.** `routes/push.ts` writes `keys` (JSONB) and reads/updates `last_used`, but the migration defines separate `p256dh TEXT` / `auth TEXT` columns and no `last_used` column. `POST /api/v1/push/subscribe` would throw at runtime as shipped. No subscriptions exist yet (feature was never exercised), so no data migration is needed — the schema is fixed to match the code, not the other way around, since the code's shape (`keys` JSONB, matching the raw Web Push API subscription object) is the one that doesn't require re-serializing on every write.

2. **Naming collision.** `useNotifications.ts` / `AppNotifications.vue` already exist and are the toast/snackbar hub (ephemeral success/error banners), unrelated to a persistent inbox. The new feature is named `useNotificationCenter` / `AppNotificationCenter` throughout to avoid ambiguity — nothing about the toast hub changes.

3. **`notification.user_id` only reaches `users`.** The doctor/patient portal is explicitly deferred (see memory: `project_doctor_patient_portal_deferred`), but the TPT base table (`identities` — note: ADR-004's rename to `person` was accepted but never implemented in the live migration; still tracked as open debt, not touched here) already unifies `users`, `practitioner`, `patient`, and `lead` via `identity_id`. Scoping the inbox to `users.id` today would mean re-keying the table (and every query against it) the day a practitioner/patient portal ships.

## Decision

### 1. `notification.identity_id` → `identities(id)`, not `users(id)`
The in-app inbox row is keyed to the universal identity, not the narrower `users` table. Only `users` has a UI to render it today (practitioner/patient portals don't exist), but no future migration is needed to widen it. Application code resolves `identities.id` from the session's `users.id` via a join (`users.identity_id`) — the session/API contract for `users` doesn't change.

### 2. Split the domain event from its per-channel delivery
Standard pattern in dedicated notification infrastructure (Novu, Knock) and at companies running their own (GitHub, Linear): **one row per event** drives the inbox; **one row per channel attempt** tracks delivery. Mirrors the `status`/`sent_at`/`delivered_at` fields already used by the `message` table, applied to a child table instead of overloading one row:

- **`notification`** — the canonical inbox item. `read_at` means "read in-app," full stop. No `channel` column anymore — a single event is not "a channel."
- **`notification_delivery`** — one row per `(notification_id, channel)`, with its own `status` (`pending`/`sent`/`delivered`/`failed`), timestamps, and `provider_message_id` for debugging. Channel dispatch (email via `@neo/email` + `mailer.ts`, push via the existing `sendPushToUser`) writes here; the bell UI never queries it.

This means one event fanned out to in-app + email + push shows up **once** in the bell, not three times, while still giving a full delivery audit trail per channel.

### 3. Badge updates: polling + existing web push, no new transport
Unread count updates via a `GET /api/v1/notification/unread-count` poll (~45–60s, only while the tab is visible) plus a refresh triggered by the already-built VAPID web push (`sendPushToUser`) nudging a refetch when the app is backgrounded. No WebSocket/SSE — that would be new, unshared infrastructure (sticky connections, a scaling concern) for a per-rep event volume (dozens/day) that doesn't need sub-second delivery. The composable (`useNotificationCenter.ts`) owns exactly one `refresh()` function as the single point where the transport could later be swapped for SSE without touching any component.

### 4. Notification `type` stays a hardcoded `CHECK` constraint for now
Same pattern as `message.status` today. Revisited only if a specific white-label tenant needs a custom type — not designed for speculatively.

### 5. Bell lives on DashboardView only; the nav dot is the cross-screen signal
The bell + panel (`AppNotificationCenter.vue`) is deliberately **not** in the global app-bar — it renders once, top-right, inside `DashboardView.vue`. Discoverability from every other screen is carried entirely by the pulsing unread dot on the Dashboard nav icon (sidebar + bottom nav), not by a persistent bell in the shared chrome. This is a narrower surface than the header-bell pattern most apps use (Gmail/Slack/Linear keep the bell global) — accepted as a deliberate product choice, not a default. The practical consequence: the unread-count **polling lifecycle must live in `AppLayout.vue`**, not in `AppNotificationCenter.vue`, since `AppLayout` is mounted for the whole authenticated session while the bell component now only exists while `DashboardView` is on screen — the nav dot has to keep updating from any other route.

The dot itself pulses (a fading, expanding halo of the same color, `::before` + `@keyframes`, `prefers-reduced-motion` respected) — a standard "something changed, look here" affordance (iOS/Android badge dots, WhatsApp unread indicators), applied identically to the bell's own dot and both nav dots so all three read as one visual language.

### 6. Scope of this change
Ships: schema (`notification`, `notification_delivery`, fixed `push_subscription`), the query/command layer, `GET/PATCH` routes, and the bell + badge UI (Dashboard-only bell, pulsing unread dot on the Dashboard nav entry in both the sidebar and bottom nav — the only nav item wired to it for now). **Not** shipped here: any domain code that actually calls `dispatchNotification()` from a lead/encounter/PCF event, or the generic templated-email sender on top of `@neo/email`. The inbox will be empty in production until a follow-up wires real event producers — that's expected, not a bug.

## Consequences
- `identities` (not `users`) is the correct join target for any future practitioner/patient notification work — no re-migration needed when that portal starts.
- Two tables instead of one for a "notification" concept is a small amount of extra complexity (one more table, one join) in exchange for correct per-channel delivery tracking and a UI that never has to de-duplicate events by hand.
- Push subscriptions are effectively reset (schema changed under an unused, empty table) — no user impact, no data loss.
- The bell will show nothing until domain events are wired to `dispatchNotification()` — tracked as explicit follow-up work, not silently deferred.

## Compliance Impact
- Push/email payloads must stay generic ("You have a new update in NeoSleep") — no patient names, diagnoses, or other PHI in a lock-screen-visible notification body. This is enforced at the call site (whoever calls `dispatchNotification()` writes the `title`/`body`), not by the schema — flagged here so it isn't missed when the first real event producer is added.
- `notification` rows are not clinical records (unlike `observation`/`consent`/`audit_log`) — safe to hard-delete on a retention job later (e.g. read items older than 90 days) rather than requiring `deleted_at` soft-delete semantics. No retention job is added in this change.
- No new personal-data category introduced — `notification.title`/`body` are operational text, not a copy of clinical data, and `identity_id` is already in the GDPR data map via `identities`.

### Notification category classification (opt-out rules)

User confirmed (2026-07-20): marketing consent gets an in-app toggle now, an email unsubscribe link later. Everything else stays as classified below — MVP-only, revisit as concrete needs arise, but **check this table before adding any new `notification.type`** so a future category doesn't accidentally ship without the opt-out behavior its legal basis requires.

| Category | Example types | Legal basis | User can opt out? |
|---|---|---|---|
| Account security | password changed, new device login, suspicious activity | Art. 32 (security of processing) + standard practice, expected by ISO 27001/SOC2 | No |
| Legal/regulatory | data breach notice (Art. 33/34), ToS/privacy policy change | Legal obligation | No |
| Operational (service-related) | PCF overdue, visit reminder, order shipped, patient assigned | Art. 6(1)(b) — performance of contract; not "marketing" under ePrivacy | No full opt-out; channel preference (e.g. SMS instead of email) is fine to offer |
| Marketing | product announcements, newsletters (none exist yet) | Consent | **Yes — mandatory, one-click, shown at first contact (Art. 21(2))** |

This table is the single source of truth for opt-out classification — do not build a separate document for it.
