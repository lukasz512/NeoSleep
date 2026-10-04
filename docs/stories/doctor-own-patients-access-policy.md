## Refined User Story: Doctor sees only own patients — one access policy for every entity (CORE-104)

**Classification**: feature (cross-cutting authorization refactor; touches every patient-linked endpoint)
**Raw input**: "doctor moze widziec pacjentow innych lekarzy, tak nie moze byc. refaktor calosci - sprawdzmy uprawnienia widoku pacjentow i innych entity."

### As a doctor, I want to see only the patients assigned to me so that other doctors' patients' health data never reaches me

### Stakeholder Notes
- 👤 User: a doctor today sees every patient in their country (plus every patient with no territory), and can open their studies, documents and questionnaires. The PWA assumes the server filters ("Doctor's own list: every patient is theirs", PatientsView.vue) — it doesn't.
- 🏢 Client: a clinic network licensing NeoSleep cannot let doctors read competitors'/colleagues' patients; this is a deal-breaker in any security questionnaire.
- 🩺 Patient: direct — sensitive health data (AHI, SpO2, clinical history, signed consents) exposed to clinicians who don't treat them. A doctor could also edit another doctor's patient or reassign them.
- 🚀 NeoCRM/Platform: core RBAC every tenant gets → CORE. One central policy (viewer = role kind + own practitioner id + territory paths) replaces ~40 ad-hoc checks; future roles (patient portal) plug into the same place.
- ⚖️ Compliance: GDPR Art. 9 / LFPDPPP sensitive data, need-to-know principle. Possibly a reportable incident if real patient data was viewed by a non-treating doctor on prod → flag for /legal (check audit_log for cross-doctor reads after the fix).

### Medical-Industry Trend Check
- n/a — internal authorization fix.

### Audit (2026-10-03) — where a doctor leaks today
- Patient + all sub-resources (history, documents, clinical records, checklist, QR links, email sends, uploads): territory only.
- Sleep studies (+ attachments), treatment plans, notes: **no row scope at all** (tenant-wide lists, any id). Treatment plans + notes even open to rep/KAM/MSL.
- POST/PATCH patient: a doctor can assign/reassign any practitioner_id.
- Device orders: patient checked by territory only.
- OrthoApnea `ensure` + treatment comments: no scope.
- Encounters: doctor reads/edits every encounter.
- Practitioners: doctor reads other doctors' profiles, national ids, signed consents; `/organization/:id/practitioners` exposes per-doctor patient counts / efficiency.
- Only appointments enforce doctor-own (queries/appointment.ts).

### Acceptance Criteria (testable)
- [ ] Doctor A: GET /patient lists only patients with practitioner_id = A's practitioner; a client `?practitioner_id=B` is ignored.
- [ ] Doctor A on doctor B's patient: 404 on GET/PATCH /patient/:id and every /patient/:id/* sub-route (no existence leak).
- [ ] Doctor A cannot list/read/write B's sleep studies, attachments, treatment plans, notes, device orders, OrthoApnea ensure/comments.
- [ ] Doctor creating a patient is always assigned to themselves; a doctor cannot change practitioner_id.
- [ ] Patients with no practitioner_id are invisible to doctors.
- [ ] Doctor account with no linked practitioner gets 403 (same as appointments).
- [ ] Admin unchanged (everything); manager/field unchanged (territory), now also applied to sleep studies / treatment plans / notes.
- [ ] All tests on real Postgres (no mocks).

### Open Questions → decision form
See the CORE-104 decision Artifact.

### Hand-off
→ `/dev` (scope clear for the patient core); decisions in the form govern practitioners/encounters/treatment-plan role line.
