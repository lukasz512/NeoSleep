## Refined User Story: Patient care team: booking with an unassigned HCP assigns them

**Ticket**: CORE-132
**Classification**: feature (new table, change to the doctor access policy CORE-104)
**Raw input** (Łukasz, 2026-10-04, PL, translated): "PWA: when you book a patient's visit with an HCP who isn't assigned to them, assign them to that doctor so the doctor can see the patient afterwards. A patient can have many HCPs assigned; specialties show who handles what."

### As a clinic coordinator / manager / rep, I want booking a visit with any HCP to give that HCP access to the patient, so that the ENT, dentist or sleep doctor seeing the patient has the record without anyone assigning it by hand.

### Stakeholder Notes
- 👤 User: today the booker must also change the patient's single doctor, which removes the previous doctor's access. Doctors open a visit with no record.
- 🏢 Client: the multi-specialist sleep pathway (sleep MD → dentist → ENT) is the NeoSleep model. Without it, the product only fits single-doctor clinics.
- 🩺 Patient: positive. Every treating HCP sees studies, plans and orders, so there are fewer repeated tests and fewer contradictory treatments.
- 🚀 NeoCRM/Platform: generic (FHIR CareTeam). It fits any tenant with more than one HCP per patient.
- ⚖️ Compliance: widens who sees health data, with access granted by staff and not by the patient. Every grant is in audit_log. Whether the new HCP sees the whole history or only what follows is a legal/product decision (D1).

### Medical-Industry Trend Check
- FHIR R4 models this as `CareTeam` (patient + participants with role/specialty). It is a standard convention, not something invented here. Web benchmarking: n/a.

### Acceptance Criteria
- [ ] New tenant table `patient_practitioner` (patient_id, practitioner_id, source primary|appointment|manual, added_by, created_at, unique pair). Backfilled from `patient.practitioner_id`.
- [ ] Booking with an HCP not on the team adds them in the same transaction, with an audit_log entry. Booking with an HCP already on the team adds nothing.
- [ ] A doctor on the team sees the patient in the list, the detail view and all sub-resources (CORE-104 policy). A doctor not on the team still gets 404.
- [ ] Doctor panel counts include care-team patients.
- [ ] A doctor may book their care-team patients (still only with themselves).
- [ ] The patient card lists all team HCPs with their specialty. The primary doctor is marked.
- [ ] Integration tests on a real DB.

### Decisions (care-team-r1, 2026-10-04, all "expanded" variants)
- D1: an added HCP sees the whole record. The primary doctor sees, on the patient card, who got access, when, and through which visit.
- D2: cancelling a visit removes the HCP when it was their only visit with the patient and they recorded nothing for this patient (no encounter, note, plan, order or completed visit). Otherwise they stay.
- D3: admin and manager can add and remove team members by hand. A rep can only add.
- D4: the booking form shows "Dr X is not assigned — they will get access to this patient" plus a required checkbox. The API also rejects the booking without `grant_access: true`.
- D5: one primary doctor (`patient.practitioner_id`, used for notifications and OA orders) plus the team. Only an admin can change the primary doctor; the previous primary stays on the team.

### Hand-off
→ `/arch assess` folded into this ticket (one join table; the policy is already centralized) → `/dev`
