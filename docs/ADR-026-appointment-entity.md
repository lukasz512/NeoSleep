# ADR-026: Patient↔Doctor Appointment Entity

## Status
Accepted (2026-09-26, NEO-27). Supersedes the unmerged "ADR-021" draft on branch `worktree-neo-27-calendar-scheduling-epic`, which was renumbered because 021 was taken on dev.

## Context

The Calendar & Scheduling epic (NEO-27/28/29/30/34) lets staff and doctors book a clinical appointment between a patient and a doctor (consultation, sleep-study follow-up, appliance fitting). Notification emails with `.ics` (NEO-28/29) and the screen (NEO-34) build on it.

We looked at two existing tables and rejected both:
- `encounter` is the rep→HCP detailing call behind `PlannerView.vue`. It has no `patient_id`, so it's a different concept.
- `visit_plan` is dead schema. Nothing in `apps/api/src` or `apps/pwa/src` references it.

FHIR R4 calls this resource `Appointment`, consistent with `encounter`, `practitioner` and `organization`.

Łukasz decided the scope in two rounds of the scoping form on 2026-09-26. They are recorded as comments on NEO-27 and summarized in `docs/stories/calendar-scheduling-epic.md`.

## Decision

A new tenant table `appointment`, created in migration `035_appointment.sql`:

| Column | Notes |
|---|---|
| `patient_id`, `practitioner_id` | NOT NULL |
| `organization_id` | Nullable. Defaults to the doctor's primary clinic (`practitioner_organization.is_primary`). Booking must not be blocked by incomplete clinic data. |
| `territory_id` | Copied from the patient at booking time. Staff scoping uses ltree `<@`, like every other territory-scoped entity. |
| `sleep_study_id`, `treatment_plan_id` | Optional clinical links, and each must belong to the same patient. This link is the only OrthoApnea integration. `treatment_plan.appointment_at` was never set by any code, so there is nothing to migrate; the column will be dropped in a later cleanup. |
| `created_by_user_id` | NOT NULL, `ON DELETE RESTRICT`: a booking never loses who made it. This is also what lets patient self-booking arrive later without a redesign. |
| `type` | Only `visit` in v1. More types and durations come later. |
| `status` | `scheduled` / `completed` / `cancelled` / `no_show`. A booking is confirmed immediately; there is no pending state in v1. Rescheduling is an UPDATE of `start_at`/`end_at`, not a status. |
| `start_at`, `end_at` | `end_at > start_at`. Default length is 60 minutes, with slots expected later. |
| `timezone` | The clinic's IANA zone, taken at booking time from the clinic's country (PL → Europe/Warsaw, MX → America/Mexico_City, TH → Asia/Bangkok), falling back to `app_config.timezone`. Times are shown in this zone, not the viewer's. |
| `location_type`, `online_url` | `clinic` / `online`. The v1 UI books clinic visits only. |
| `notes`, `metadata`, timestamps, `deleted_at` | `deleted_at` is an admin soft delete for mistakes. Cancelling is a status. |

**No double booking** is enforced by the database: `EXCLUDE USING gist (practitioner_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (deleted_at IS NULL AND status <> 'cancelled')` via `btree_gist`. The API maps SQLSTATE 23P01 to 409. Back-to-back appointments are allowed because the ranges are half-open. A cancelled appointment frees its slot.

### Access (commands/appointment.ts, queries/appointment.ts)

| Role | Sees | Books | Marks completed / no-show |
|---|---|---|---|
| admin | everything | anyone | yes |
| manager | own territories | patients in scope | yes |
| doctor | only own appointments | only own patients (`patient.practitioner_id`), always with themselves | own |
| rep / kam / msl | own territories, **without notes or clinical links** | patients in scope, no notes/links | no |

- Reschedule or cancel: the doctor, a manager, an admin, or whoever booked the appointment.
- The doctor gets an in-app notification (`appointment_booked` / `_rescheduled` / `_cancelled`) when someone else acts on their appointment.
- Clinical reads (list and detail, by admin, manager or doctor) leave an `audit_log` `read` row, as in NEO-83. Field-force reads are redacted, so they are not health-data reads.
- `manager` closing appointments is the v1 answer while Alfred's super-user access runs through the `manager` role. Separating roles is NEO-90.

## Consequences

- Enables NEO-28 (emails), NEO-29 (`.ics` with stable UID `appointment-{id}@neosleepcare.com`) and NEO-34 (screen) without touching `encounter` or reviving `visit_plan`.
- Patient self-booking (form answer I1: after the patient panel exists) needs no schema change. `created_by_user_id` would become a patient-identity reference or a separate column at that point.
- Known v1 limits: a single zone per country (MX's other zones need per-clinic settings), and a doctor without a primary clinic gets a location-less appointment.

## Compliance Impact

- `notes` and the clinical links are health-adjacent data (GDPR Art. 9 / LFPDPPP). They are hidden from the commercial field force and their reads are audited.
- No new sub-processor. The email and consent gating arrive with NEO-28, per the `/legal` review in the story.
