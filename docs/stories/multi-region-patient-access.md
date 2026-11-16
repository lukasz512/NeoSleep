## Refined User Story: Cross-region access to patients — one rule set, honest 403 messages (CORE-224)

**Classification**: feature (platform RBAC; a reasonable person could disagree on the cross-region rules)
**Raw input**: Łukasz, 2026-11-16, after rescheduling a visit on pwa-dev answered "Este paciente está fuera de su región": we must decide how this works with many regions; for now everything is in one database; either that, or a doctor must not reach patients outside their region; "this must work better". Consult product, QA and the other skills.

### As a rep, KAM, MSL, manager or doctor working in one country of a multi-country tenant, I want to reach exactly the patients my role and region allow, and to be told the real reason when I am refused, so that I neither see another region's patients nor get blocked by a message that sends me looking in the wrong place

### Audit (2026-11-16) — what the code does today

- **The message was wrong, not the region.** `AppointmentDialog.vue` (`explain`) shows `user.appointments.form.outsideScope` for every 403 from a non-doctor. The API has five different 403 reasons on appointment create/update: territory, "only whoever booked this appointment can change it", "notes and clinical links are for clinical staff only", "only the doctor, a manager or an admin can close a visit", "belongs to another doctor". All arrive as the same `FORBIDDEN` code.
- **A patient without a territory is not blocked — the opposite.** `assertTerritoryAccessByTerritoryId` lets a NULL `territory_id` through for everyone, and seven list queries carry `territory_id IS NULL OR …` (patient, practitioner, lead, organization, appointment, encounter, patientScope). This is the rollout fallback from migration 022. So the handoff's first guess ("no territory, so nobody but an admin") is disproved: an unassigned patient is visible to every rep in every country.
- **Nothing sets a territory on create.** `CreatePatientCommand` stores `input.territory_id` as sent; there is no default from the creator or the address.
- **Likely cause of the 403 he saw (not confirmed, a test settles it).** The server sorts roles into admin / manager / doctor / everything else = `field` (`entityAccess.ts`), so `support` (CORE-197, same day) is `field`. The PWA's `isFieldForce` lists only rep / KAM / MSL (`useAppointments.ts`), so a `support` user gets the reschedule button and the notes field, and the server refuses with a non-region 403.
- **Doctors are not region-scoped at all.** A doctor reaches a patient through the care team (CORE-104, CORE-132), whatever the patient's country.
- **A manager can already hold several scopes in the data model.** `user_roles` is UNIQUE (user_id, role, territory_id), and `getAllowedScopePaths` merges all granted scopes; `global` means every country.

### Stakeholder Notes
- 👤 User: a rep or manager is told "outside your region" for a rule that has nothing to do with region, so they call support instead of asking the booker. Reps also see unassigned patients from other countries in their list.
- 🏢 Client: a pharma company running PL and MX expects country teams to be separated, and expects it to be demonstrable in a security questionnaire. "Unassigned records are visible to all" fails that.
- 🩺 Patient: direct. Health data of a patient with no territory is readable by field staff in another country. A wrong refusal also delays a rescheduled visit.
- 🚀 NeoCRM/Platform: core RBAC for every tenant → CORE. One reason-coded 403 and one shared role-kind mapping remove a class of bugs for every future role (support was the first to fall in the gap).
- ⚖️ Compliance: flag for `/perspective legal`. PL patients are under GDPR Art. 9, MX under LFPDPPP; staff in one country reading the other's patients is a cross-border disclosure inside one database. Need-to-know applies inside the tenant too.

### Views consulted (as lenses in this pass, not separate skill runs)
- **Product owner**: two slices. Slice 1 (honest messages + role-kind parity) is a bugfix with no open decision and can ship first. Slice 2 (territory required, fallback closed, cross-region rules) waits for the decision form.
- **Legal/GDPR**: logical separation by territory inside one database is acceptable for the MVP if it is enforced without exceptions; the NULL fallback is the exception to remove. Physical separation per country is a later, larger call.
- **QA**: every rule is testable per role on real Postgres; the missing coverage is "restricted user × unassigned record" and "each 403 reason → its own message".
- **Architecture**: no new table. `ForbiddenError` gains a reason code; `entityAccess.ts` stays the single policy; one migration backfills `identities.territory_id` for patients and the `IS NULL OR` branches are removed after it.

### Medical-Industry Trend Check
- n/a — internal authorization change.

### Decided by default — a test proves it
- Each 403 from appointment create/update carries a machine reason (`OUTSIDE_TERRITORY`, `NOT_BOOKER`, `CLINICAL_FIELDS`, `CANNOT_CLOSE`, `OTHER_DOCTOR`) and the dialog shows the matching i18n message in en/pl/mx; an unknown reason falls back to a neutral "you are not allowed to do this".
- The PWA derives field-force / manager / doctor / admin from the same mapping the server uses; a `support` user sees no reschedule button on a visit they did not book and no notes field.
- A restricted user with zero roles is refused everywhere (already true, stays covered).
- Rep / KAM / MSL reach only records inside their granted scopes; no cross-country exception.
- A new appointment inherits the patient's territory.

### Acceptance Criteria (testable)
- [ ] For each of the five 403 reasons, an API test asserts the reason code and a component test asserts the matching message; none of the four non-region reasons renders `outsideScope`.
- [ ] A `support` user, and any future role, gets the same rights client-side as server-side (one shared mapping, test iterates over the `user_roles` CHECK list).
- [ ] POST /patient without `territory_id` stores a territory according to the decision (Q2); no patient row is left with NULL after the backfill migration; no hand SQL.
- [ ] After the backfill, a PL-scoped rep gets 404/403 on an MX patient and on any previously unassigned patient, for GET /patient/:id, every sub-route, and the list.
- [ ] A manager with roles in PL and MX sees both; with PL only, only PL (Q3 decides whether the admin UI offers it).
- [ ] Doctor access follows Q1; whichever answer, a test covers a doctor on the care team of a patient in another country.
- [ ] All API tests on real Postgres.

### Decisions (form core-224-r1, answered by Łukasz 2026-11-16)
- [x] Q1 Doctor and another country → **yes**: the care team is enough; region does not limit a doctor (unchanged behavior).
- [x] Q2 Patient without a territory → **more**: assign the creator's country; when it cannot be derived (global admin, old rows) the patient goes to a "to assign" queue only an admin sees. The backfill migration uses the same rule, then the `IS NULL OR` fallback is removed.
- [x] Q3 Manager, several countries → **more**: an admin can grant several countries, and lists and reports get a country switch.
- [x] Q4 One database → **more**: stay on one database separated by territory; legal review (GDPR / LFPDPPP) before real PL patients, physical split decided after it.

### Open Questions
- none

### Hand-off
→ `/dev` slice 1: reason-coded 403 + role-kind parity.
→ `/arch assess` slice 2: territory on create, admin "to assign" queue, backfill migration, fallback removal.
→ Slice 3: manager multi-country grant in the admin UI + country switch (`/ux`).
→ `/perspective legal`: data residency review before PL patients (Q4).
