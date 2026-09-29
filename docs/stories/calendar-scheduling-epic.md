## Refined User Story: Calendar & Scheduling Epic

**Classification**: feature
**Raw input**: Łukasz wants a Linear epic about the calendar — HCPs and patients should get an email when a visit is booked, any role should be able to book one, and it should sync with device calendars (phone/computer), for free or cheap.

**Linear**: Project [Calendar & Scheduling](https://linear.app/neosleep/project/calendar-and-scheduling-380d0de28392), issue label `Calendar`.
Sub-issues: NEO-27 (new `appointment` entity + RBAC), NEO-28 (booking emails), NEO-29 (.ics + add-to-calendar links), NEO-30 (future — OAuth two-way sync, deferred), NEO-34 (appointments screen — agenda for doctor, region/personal for staff).

### As a rep/KAM/MSL/manager/admin/doctor, I want to book a patient↔doctor appointment and have both sides automatically notified — including a calendar entry on their own device — so that nobody double-books and nobody finds out about the appointment only by showing up.

### Correction made mid-enrichment (2026-09-16) — read this before touching any existing table
The first pass of this doc assumed "visit" meant the rep→HCP detailing call already modeled by `encounter` (which backs [PlannerView.vue](../../apps/pwa/src/views/PlannerView.vue)), and tried to reuse `visit_plan` for scheduling. Both assumptions were wrong, confirmed by reading the actual code and schema:
- `encounter` has `user_id` (rep), `practitioner_id` (HCP), `organization_id` — **no `patient_id` column at all**. Structurally cannot represent a patient's appointment.
- `visit_plan` exists in `apps/api/migrations/001_tenant_schema.sql` / `003_...sql` but has **zero references** anywhere in `apps/api/src` or `apps/pwa/src` — dead schema from an earlier design, superseded by `encounter`'s own `status` lifecycle (`scheduled → completed/cancelled/no_show`) for the rep-visit use case it was meant for.
- Confirmed with Łukasz directly: "wizyta" in this epic means a **patient↔doctor clinical appointment** (consultation, sleep-study follow-up, appliance fitting) — a concept that has no existing table anywhere in the schema. `sleep_study`, `treatment_plan`, `purchase_order`, `support_ticket` are the only tables with `patient_id`, and none of them model a scheduled future appointment.
- **Conclusion**: this epic needs a genuinely new entity. FHIR R4 (which this schema already aligns to — see `encounter`, `practitioner` naming) calls this resource `Appointment`. Route the actual table design through `/arch new-entity appointment` rather than freelancing a migration — this doc scopes the *feature*, not the schema.

### What already exists (don't rebuild, don't confuse)
- `visit_plan` table + [PlannerView.vue](../../apps/pwa/src/views/PlannerView.vue)/`encounter` — rep→HCP detailing calendar. Unrelated concept, see correction above. Do not extend `encounter` for this.
- `apps/api/src/services/googleCalendar.ts` + `apps/api/src/routes/booking.ts` — a *different* feature (public "book a demo call" widget on neosleepcare.com, single shared personal Gmail calendar via OAuth refresh token, for sales leads). Not to be conflated or reused as-is; the auth model (one shared refresh token) doesn't generalize to per-doctor/per-patient calendars.
- `mailer.ts` (Resend) for email delivery; `notification` + `notification_delivery` tables for in-app/audit trail; `consent` table for consent tracking.
- The `doctor` role: already a real, working PWA login today via `invitePractitioner.ts` (staff invites an HCP, HCP sets a password, gets a restricted own-view — see `apps/pwa/src/router/routes.ts` `ALL_STAFF_ROLES` and `usePermissions.ts`). This is NOT the same thing as the CLAUDE.md "HCP auth — magic link" open question, which appears to concern a separate, broader self-service portal for HCPs who haven't gone through this heavier partner-invite flow. Confirmed: no auth blocker exists for doctor-role appointment booking in v1.

### Stakeholder Notes
- 👤 **User**: Reps/KAMs/MSLs/managers/admins and doctors currently have no way to schedule a patient appointment in-app at all, let alone notify anyone. This adds a missing capability, not just an improvement to an existing one.
- 🏢 **Client**: Tenant admins get a more professional, automated patient/doctor touchpoint at no extra licensing cost (Resend + a lightweight .ics generator, no third-party calendar subscription). Also reduces wasted clinic time from no-shows.
- 🩺 **Patient**: Direct effect, not just indirect — a patient who doesn't know their appointment time is a patient who doesn't show up for sleep-study follow-up or appliance fitting. No-show reduction has real clinical continuity value (see trend check below).
- 🚀 **NeoCRM/Platform**: Generic across tenants and markets (PL/MX) — no tenant-specific logic needed beyond existing i18n. A new FHIR-aligned `appointment` entity is also a reusable platform primitive (white-label scalability), not a one-off.
- ⚖️ **Compliance**: Real GDPR surface. Patient email address + appointment time leaves NeoCRM's control the moment it's emailed (can't be "deleted" from the recipient's inbox on an erasure request — inherent limitation of email, should be disclosed in the privacy policy). Recommend: (1) gate patient emails on the existing `consent` table having an active communication consent, (2) keep email/`.ics` body minimal — time, location, purpose only, never diagnosis or treatment plan detail. Doctor emails are lower-risk (professional context), but same data-minimization rule applies. → flag to `/legal` before NEO-28 ships if not already covered by an existing consent flow.

### Medical-Industry Trend Check
- Average no-show rate across healthcare settings is ~23%, and a single reminder (email/SMS) has been shown to cut no-shows by 30–50%; systematic reminder programs have taken some clinics from 23% to 8% no-shows within six months. — [Appointment Reminder: No-Show Statistics & Data 2026](https://appointmentreminder.com/guides/no-show-statistics/)
- A 2025 NHS audit (North Westminster Community Mental Health Team) found a 33% improvement in attendance from reminders sent one working day ahead. — [SmartSMSSolutions: Medical Appointment Reminders 2025 Guide](https://smartsmssolutions.com/resources/blog/business/medical-appointment-reminders-cut-no-shows-by-60-2025-guide)
- Recommended pattern across sources: an email with full visit details + a calendar invite, sent as soon as the appointment is booked — which is exactly what a `.ics` attachment on the booking confirmation gives us for free.

### Decisions made in this enrichment pass
- **Who can book (v1)**: staff (rep/kam/msl/manager/admin) AND the doctor themselves — both create appointments within their own scope (staff: territory/region scope; doctor: their own patients). Patient self-booking is explicitly future, blocked on a patient panel that doesn't exist yet — not a policy exclusion, a technical one.
- **Optional clinical context**: an appointment may (not must) link to a `sleep_study` or `treatment_plan` — exact FK/nullable design left to `/arch new-entity appointment`.
- **UI placement (resolved 2026-09-17)**: a **new dedicated screen** (e.g. `/appointments`), not folded into `PlannerView` — different business concept (`appointment` vs `encounter`), different audience. Reuse the same underlying Vuetify calendar component where it fits, for visual consistency, but keep the route/data source separate. Tracked as NEO-34.
- **Visibility/RBAC per role (resolved 2026-09-17)**:
  - doctor → own appointments only, **default view = simple agenda/list**, not a calendar grid (doctors have far fewer appointments than a rep tracks HCPs — a grid is unnecessary complexity for them)
  - rep → own appointments only (not full territory oversight)
  - manager → full region/territory oversight, all appointments regardless of who created them
  - admin → everything
  - patient → future, once a patient panel exists
  - Note: a separate in-flight ticket, NEO-31 ("Territory migration — retire `region` in favor of `territory_id`"), may change which column staff-scoping should actually use — check its status before finalizing the entity's scoping column in `/arch new-entity appointment`.
- **Appointment creation entry points (resolved 2026-09-17)**: both (a) a "New appointment" button on the appointments screen itself, and (b) a contextual "Book appointment" action from the patient's own detail view (pre-fills the patient).
- **Device-calendar sync approach (v1)**: `.ics` file attached to the email + "Add to Google Calendar / Outlook" links. Free, no OAuth, works on every mainstream calendar app, and supports update/cancel via a stable UID (`METHOD:REQUEST`/`METHOD:CANCEL`) so a reschedule or cancellation actually updates the recipient's device calendar instead of leaving a stale duplicate entry.
- **Notification channel (v1)**: email only. WhatsApp/SMS (infrastructure already exists via `conversation`+`message`) explicitly deferred — revisit only if email turns out to be insufficient, especially for the MX market.
- **Missing patient email (resolved 2026-09-17, MVP)**: patients are expected to always have an email on file. If one is somehow missing, the appointment still gets created, the confirmation email is silently skipped, and the booking user sees an in-app notification ("patient has no email on file, confirmation not sent"). No SMS/WhatsApp fallback in v1 — revisit only if this turns out to matter in practice.
- **Deferred, not rejected**: true two-way OAuth sync (Google Calendar API + Microsoft Graph) is tracked as NEO-30, explicitly low priority, not to be started without evidence that `.ics` is insufficient in practice.

### Acceptance Criteria (epic-level — see each sub-issue for its own)
- [ ] `/arch new-entity appointment` designs and migrates the new entity (NEO-27)
- [ ] Staff (rep/kam/msl/manager/admin) and doctor can each create an appointment within their scope (NEO-27)
- [ ] Patient and doctor each receive an email on appointment booked/rescheduled/canceled (NEO-28)
- [ ] Patient emails are gated on active communication consent; email content excludes clinical detail (NEO-28)
- [ ] Booking email includes a valid `.ics` attachment + add-to-calendar links; reschedule/cancel update the same calendar entry via stable UID (NEO-29)
- [ ] Dedicated appointments screen exists with per-role visibility (doctor agenda, rep own, manager region, admin all) and both creation entry points (NEO-34)
- [ ] All new user-facing copy added to `packages/i18n/en.json` first, with pl/mx parity before merge
- [ ] Two-way OAuth sync is explicitly out of v1 scope (NEO-30, backlog only)

### Open Questions — all resolved 2026-09-17, see ADR-026
- [x] Exact `appointment` table design — done, `docs/ADR-026-appointment-entity.md`
- [x] `region` vs `territory_id` — NEO-31's migration is already done in code (verified: `020_territory_hierarchy.sql`..`024_territory_path_default.sql`, `user_roles.territory_id` is live). Uses `territory_id`.
- [x] "Rep sees own appointments" — resolved as territory-hierarchy containment (same mechanism as manager, narrower node), not a new patient-ownership column. `patient` has no `assigned_rep_id` and adding one is explicitly out of scope for this epic.
- [x] Consent for patient emails — resolved via `/legal`: not a fresh opt-in, gate on the existing `consent` table (purpose is free-text, no migration needed), `legal_basis` = `legitimate_interest`/`contract` for PL/EU, `consent` for MX.
- [x] `.ics` `LOCATION` reliability — resolved: `organization_id` on `appointment` is **nullable**. A doctor without a DB-enforced primary clinic (practitioner_organization has no NOT NULL guarantee) still gets an appointment created; `.ics`/email just omits the address.

### New open item from the `/arch` pass
- [ ] Whether to cut the actual numbered migration file now, given `/dba`'s current live state is "sandbox cleanup phase, not new migrations" — needs Łukasz's explicit call, flagged on NEO-27.

### Hand-off
→ Migration file for `appointment` (per ADR-026) — pending Łukasz's call on the dba cleanup-phase question above.
→ `/legal` — consent-gating for patient emails, before NEO-28 ships (design already reviewed, just needs implementing).
→ `/dev` — NEO-34 (appointments screen) once NEO-27's entity/API exists.

---

## Update 2026-09-26: scoping form (two rounds), supersedes conflicting points above

Łukasz answered 23 questions in the decision form (https://claude.ai/artifact/J9M6jiiYfUfNbcFW5iTNyB). The answers are recorded on NEO-27. Where they differ from the 2026-09-16/17 notes above, **these win**:

- **Migration now** (A1), which answers the open item above. v1 = entity, API and screen. Emails and `.ics` (NEO-28/29) come in a separate PR afterwards (A2).
- **Who books** (B1, I1): admin, manager, doctor, rep/KAM/MSL. **Patients do not book in v1.** Self-booking returns together with the patient panel.
- **Doctor** (B2, B3): books only their own patients (`patient.practitioner_id`), always with themselves. When staff book, the doctor defaults to the patient's assigned doctor and can be changed.
- **Confirmation** (B4): a booking is confirmed immediately. The doctor gets an in-app notification and can cancel.
- **Time** (C1–C3): any time is allowed, and the database blocks overlaps. **Default length is 60 min** (slots come later). One type, "visit". The clinic's time zone is used.
- **Place** (C4): the model supports clinic and online, but the v1 UI books clinic visits only.
- **Existing data** (D1, D2): an optional link to the OrthoApnea treatment plan (`treatment_plan.appointment_at` was never used, so there is nothing to move) and an optional link to a sleep study.
- **After the visit** (E1–E3): completed/no-show is set by the doctor, admin or **manager** (Alfred; roles are cleaned up in NEO-90). After "completed", the UI offers to book the next visit. The 24-h reminder comes later, with the emails.
- **Privacy** (F1–F3): rep/KAM/MSL see the time, patient and doctor, but **not notes or clinical links**. Clinical reads are audited. With no consent or no email, the appointment is still created and the booker gets an in-app notice (NEO-28).
- **Visibility** replaces "rep → own appointments only" above: the field force sees appointments in their territories (redacted), a manager sees their territories, a doctor sees only their own, and admin sees everything.
- **Screen** (G1–G3): the doctor still lands on /patients, and the agenda sits in the menu. Day/week agenda, list on the phone. "Book appointment" appears on the patient card, the appointments screen and the doctor (HCP) card.
- **Existing "Umów wizytę" button** (planning, 2026-09-26): on the patient card it now books an appointment. On the HCP card the old button stays as "Plan rep visit" (encounter), with a new "Book patient" button next to it.
- **Delivery** in two PRs: (1) migration + API + tests, (2) screen + dialog + buttons.

### Acceptance criteria (v1 = NEO-27 + NEO-34)
- [ ] Migration 035 creates `appointment` with the no-double-booking constraint. `create_tenant_schema()` is regenerated and the CI parity check is green.
- [ ] The role matrix in ADR-026 is enforced by the API and covered by real-DB tests.
- [ ] An overlapping booking returns 409, while back-to-back bookings and bookings over a cancelled appointment succeed.
- [ ] rep/KAM/MSL never receive notes or clinical links.
- [ ] Clinical reads are audited. Only admin can delete (soft delete).
- [ ] The doctor is notified when someone else books, reschedules or cancels.
- [ ] The appointments screen, booking dialog and card buttons are in place (PR 2), with all copy in en/pl/mx.
