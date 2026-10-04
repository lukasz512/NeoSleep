## Refined User Story: Doctor Panel — Today + Needs your action (NEO-233)

**Classification**: feature (new doctor-facing surface + new read endpoint; scoped by the 2026-10-04 decision forms)
**Raw input**: "doctor - potrzebuje stworzyć panel - zaproponuj mi co możemy mu pokazać" → 6 tiles proposed; this story covers tiles ① and ②.

### As a doctor, I want to see today's visits and what is waiting on me at the top of my patient list so that nothing clinical stalls between visits

### Decisions (Łukasz, 2026-10-04)
- D1: the Panel is the doctor's start screen, with tiles ① ② on top and the existing patient list below. Implemented as tiles at the top of /patients (the doctor's landing page already), not a second landing route.
- D2: tiles ①②③④ go live together; ⑤ follow-ups and ⑥ AHI outcomes come once there is data. ①② ship now behind a per-tenant switch.
- D3: the AHI tile (⑥) needs 5 patients with a before/after study pair (out of scope here).
- D4: no money on the Panel; a separate "Rozliczenia" view later (out of scope).
- D5: build ①② now; ③–⑥ go to Dra. Lorena as a mockup in parallel.

### Stakeholder Notes
- 👤 User: doctors today open each patient to find pending work; results waiting for interpretation and patients who cancelled are easy to miss.
- 🏢 Client: faster turnaround from study result to treatment means more completed treatments per doctor (the clinic's revenue line).
- 🩺 Patient: direct but positive. Results get interpreted sooner, and a "can't attend" reply gets a reschedule instead of a no-show.
- 🚀 NeoCRM/Platform: generic for any clinical tenant (appointments, studies, plans, consents are core tables). The switch is a per-tenant `app_config.integrations.features.doctorPanel`.
- ⚖️ Compliance: health data (patient names + clinical states). Scoped by the CORE-104 viewer (own patients only), and the read is written to the health-data audit trail like the sleep-study list.

### Medical-Industry Trend Check
- n/a — the clinical content of the queue is Dra. Lorena's call (D5); this tile only surfaces states that already exist in the record.

### Tile ① Today
Own appointments today and tomorrow (local day of the device), not cancelled: time, patient, organization, the patient's answer (confirmed / can't attend / awaiting). Tap → patient. Reuses GET /api/v1/appointments (already doctor-scoped).

### Tile ② Needs your action
GET /api/v1/doctor-panel/actions → `{ enabled, items[] }`, one item per thing to do, own patients only:
| kind | rule |
|---|---|
| `results_to_interpret` | sleep_study.status = `results_received` |
| `cannot_attend` | upcoming (start_at ≥ now) scheduled appointment with patient_response = `cannot_attend` |
| `plan_not_notified` | treatment_plan.status = `initiated`, not deleted |
| `consent_missing` | non-discharged patient missing a consent-mode checklist document (no non-withdrawn consent row with that purpose and no file attached to that item) — same rule as the patient checklist |

### Acceptance Criteria (testable)
- [ ] Doctor A's actions list contains each of the 4 kinds for A's patient and nothing from doctor B's or unassigned patients. (`doctorPanel.spec.ts`)
- [ ] A resolved state drops out: an interpreted study, a notified plan, a past or confirmed appointment, a signed consent. (`doctorPanel.spec.ts`)
- [ ] Non-doctor roles get 403. (`doctorPanel.spec.ts`)
- [ ] Switch: absent → on in dev/local, off on prod; explicit value always wins; when off, `{ enabled: false, items: [] }` and the PWA shows no tiles. (`doctorPanel.spec.ts`, `DoctorPanelTiles.spec.ts`)
- [ ] Tiles render only for the doctor role (`v-if="isDoctor"` in PatientsView; the endpoint answers 403 to every other role, `doctorPanel.spec.ts`); admin/manager/rep see the patient list exactly as before.
- [ ] Empty tiles show an empty state instead of disappearing. (`DoctorPanelTiles.spec.ts`)
- [ ] Every item and appointment links to its patient. (`DoctorPanelTiles.spec.ts`)
- [ ] All strings in en/pl/mx (parity check).

### Open Questions
- none for ①②. Still to clarify: what "naprawić przed go-live" (round-1 note on D2) referred to.

### Hand-off
→ `/dev feat doctor-panel` — scope is clear; ③–⑥ mockup goes to Dra. Lorena separately.
