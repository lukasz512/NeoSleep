## Refined User Story: Clinical questionnaire capture redesign (STOP-Bang first)

**Classification**: feature. It adds a new patient capture flow, a new doctor view, new measurement columns (a migration) and a pre-visit email. Several parts of it can be reprioritised.
**Raw input** (Łukasz, 2026-09-26, decisions on the proposals in https://claude.ai/artifact/GtqQjYjDqzt41wFyR7Wgix):
> form 1 for QR and in the email the day before the visit: that reminder carries the questionnaires to fill before the appointment. If the patient has not filled them in, reception can give them a QR code to the form, or print it. Remember animations for these patient forms, so they look beautiful and modern. Form 2: I do not want it. Form 3: this is how the doctor should see it once the patient has filled it in. In form 1, S-T-O-P is for the patient and B-A-N-G is done by the doctor. The study list must show that half the form is the patient's and half the doctor's, with a status "filled in by the patient, waiting for the doctor to complete".

Earlier decisions in the same thread:
- Signature model A: a stamp "answered by the patient via personal link, date/time", plus the specialist's signature. The same rule applies to Antecedentes médicos.
- The result is shown as a 0–8 scale with three risk zones, both in the app and on the PDF.
- One shared form grammar across all clinical forms. The OrthoApnea order form must converge on it later, not now.

### As a patient, I want to answer my part of the screening on my phone before the visit, one friendly question at a time, so that my visit is shorter and my specialist has my answers ready.
### As a specialist, I want to see the patient's answers already in place and only enter my measurements, so that the score and risk are correct without mental arithmetic.

### Stakeholder Notes
- 👤 User: the patient (S-T-O-P, phone, via QR code or email) and the specialist or dentist (B-A-N-G chairside, reviewing). Today the patient part already works through the QR multi-step flow (`PatientQuestionnaireView.vue`), with plain Yes/No rows. The doctor completes B-A-N-G in `ClinicalQuestionnaireDialog` (`completeBang` mode) as Yes/No with no measurements.
- 🏢 Client: the clinic and tenant get shorter visits and a higher pre-visit completion rate. A polished patient-facing form is also a visible brand touchpoint for a white-label tenant.
- 🩺 Patient: this has a direct clinical effect. The score drives the decision to refer for a sleep study. Computing BMI from height and weight, and storing the real neck and BMI values, removes a source of wrong scores. The risk label must say that the specialist makes the final assessment.
- 🚀 NeoCRM/Platform: the card-by-card patient renderer and the shared row grammar are generic. The same components should serve Antecedentes médicos and future questionnaires. Build them per question type, not STOP-Bang-specific, apart from the letter progress.
- ⚖️ Compliance: the email reminder sends a link that opens health questions. Check that it is covered by the patient's contact consent (LFPDPPP/GDPR). Keep health data out of the email body. The link must stay single-use and time-limited, as the QR link is today. Storing the raw measurements (height, weight, neck) adds health data. Access stays admin/doctor only, as decided for health data before (ADR-023/024). → `/legal` should do a quick check of the email channel.

### Medical-Industry Trend Check
- Pre-visit digital messaging raised patient-reported outcome completion from 30% (no message) to 49% (portal) and 52% (email) in a 291-patient randomised trial. Source: [ClinicalTrials.gov NCT04983641](https://clinicaltrials.gov/study/NCT04983641).
- Practices with a well-designed digital intake reach 70–85% completion before the appointment. They finish the rest on a tablet at check-in, which matches the "QR code or print at reception" fallback. Source: [Dialog Health](https://www.dialoghealth.com/post/digital-patient-intake-forms-statistics). This is a vendor figure, so treat it as indicative.
- The published STOP-Bang forms split the questions the same way: S-T-O-P is self-reported, and B-A-N-G is measured by the clinician (BMI > 35, age > 50, neck > 40 cm, male). Source: [AASM sleepeducation.org STOP-Bang PDF](https://sleepeducation.org/wp-content/uploads/2023/01/Stop-Bang-Questionnaire.pdf).

### Acceptance Criteria
- [ ] Patient flow (QR link and email link) shows S-T-O-P one question per screen, with an illustration, large Sí/No buttons (≥ 56 px), and S-T-O-P letters as progress that can be tapped to go back.
- [ ] After a Sí/No tap the flow moves to the next card with an animation. Card transitions and the progress change are animated, and a reduced-motion setting switches animations off.
- [ ] The patient flow renders correctly from 320 px to desktop width, with no horizontal scroll.
- [ ] The patient never sees B-A-N-G questions.
- [ ] The day before an appointment, the patient receives an email with a link to their open questionnaires. No health data appears in the email. The link is single-use, expires, and follows the same rules as the QR link. (Blocked on an appointment date: see Open Questions.)
- [ ] Reception can show the QR code for the open questionnaires, or print a blank form, from the patient's record.
- [ ] The doctor's view of a patient-answered STOP-Bang shows the S-T-O-P answers read-only, with the stamp "Respondido por el paciente vía enlace personal · <date time>".
- [ ] The doctor enters height (cm), weight (kg) and neck (cm). BMI is computed and shown. B and N become Sí/No automatically. A and G come from the patient's date of birth and sex on record.
- [ ] The raw measurements (height, weight, neck, computed BMI) are stored with the record, through a new numbered migration.
- [ ] The score is shown as 0–8 with zones 0–2 low, 3–4 intermediate and 5–8 high, the same in the app and on the PDF.
- [ ] The study list shows STOP-Bang in two halves (patient / doctor), with statuses: not started, "filled in by the patient, waiting for the doctor", and complete.
- [ ] The PDF shows the patient stamp plus the specialist's signature line (signature model A). Antecedentes médicos uses the same patient stamp.
- [ ] Doctor rows use the same row component as Antecedentes médicos and Exploración oral: icon or letter, question, and Sí/No in a fixed right column.

### Open Questions
- [ ] **Appointment date for the reminder**: there is no `appointment` entity yet (the Calendar & Scheduling epic, NEO-27..30, is planned). Should the email wait for that epic, or ship first with a manual "send questionnaires by email" button on the patient?
- [ ] Which questionnaires go in the pre-visit email: always STOP-Bang, Antecedentes médicos and the consent, or a choice per visit type?
- [ ] Illustrations: are simple line icons in the brand teal enough, or should an illustrator draw a custom set?
- [ ] Should the reception printout be a blank form with the patient banner pre-filled, or entirely blank?
- [ ] Sex for G: is `patient.sex` reliably set in the MX data today? If it is empty, should the doctor answer G manually?
- [ ] If the patient answers only 2 of the 4 S-T-O-P questions and closes the page, do we save partial answers and resume, or restart?

### Hand-off
→ `/arch assess clinical-questionnaire-capture`: the measurement columns (migration), the per-half status model on the checklist, and the email-link token reuse.
→ `/legal`: the email reminder channel and consent.
→ `/product`: sequence it relative to the Calendar epic (reminder) and the PDF document-system work (branch `worktree-document-clinical-theme`).
