## Refined User Story: Historia clínica, a guided doctor flow (NEO-260)

**Classification**: feature. It changes the doctor's first-visit workflow and what the clinical-record PDF contains.
**Raw input** (Łukasz, 2026-10-07): "Historia clínica shows me 7 documents when I really have 3 … the doctor should go step by step, the app tells him what to fill in." Follow-up: "We can have 1 copy of the consentimiento informado. Before generating PDFs, the system should ask which documents to print."
**Problem list + round 1 decisions**: https://claude.ai/artifact/YWmJRn6tMsNHUxYyuzdicY

### As a doctor at a patient's first visit, I want the app to lead me through the clinical history one step at a time, and to ask what to print, so I fill everything in once and print each document only once.

### Context
- The "7 documentos" counter (`PatientChecklistPanel.vue` `summary`) counts raw checklist items: 4 HC sections, the printable `historiaEndo`, `informedConsent` and one more document assigned in admin. `historiaEndo` is "done" only through an upload, so the counter never reaches 100%.
- `historiaEndo.html` page 3 always prints the full Consentimiento informado (NEO-249), so the consent exists twice: as its own signed item, and inside every HC PDF.
- On "Imprimir historia clínica", a doctor gets `DoctorSignatureDialog` (NEO-255). Other roles print straight away.

### Decisions
Round 1 (2026-10-07, all the "more" variant):
1. Replace the counter with a first-visit axis, "Paso X de 6": consent → antecedentes + STOP → medidas → exploración → ATM → resumen/firma. Estudio de sueño is "Siguiente", outside the count.
2. Keep the HC tile and add one "Continuar: <next step>" button in protocol order. Every section can still be opened by hand.
3. Name a source for each section, on screen and in the PDF. Antecedentes → consenso internacional AOS 2021. STOP-Bang → Chung et al. Signos → AADSM 2022. The whole flow → Protocolo NeoSleep (Dra. Lorena).
4. In Resumen, the app suggests Indicado / Contraindicado and the doctor confirms with one tap.
5. Clinical field gaps go to Dra. Lorena first. NEO-260 doesn't change any clinical field.

Chat (2026-10-07):
6. The Consentimiento informado exists only once.
7. Before generating a PDF, the system asks which documents to print.

Round 2 (print picker, phasing): see the plan artifact.

### Stakeholder Notes
- 👤 Doctor: today 6 different actions per item and no "what's next". Wants one pass, in protocol order, in the chair.
- 🏢 Client (NeoSleep, Dra. Lorena): the protocol is the source of truth, and she decides the clinical screens. The source line credits her protocol.
- 🩺 Patient: signs the consent once. No second signing line in the HC PDF.
- 🚀 Platform: the step definitions are config (an ordered list of checklist keys), not hardcoded in the component, so another tenant can reorder them.
- ⚖️ Compliance: NOM-004 expediente. The signed consent PDF in storage stays the original, and any reprint is marked as a copy. Every print stays audit-logged, along with which documents it included.

### Acceptance Criteria
- [ ] The Documentos header shows "Paso X de 6", never a raw item count. The HC counts as its sections, and the printable HC is not a step.
- [ ] The HC tile has one primary "Continuar: <step>" button that opens the first step not done. Tabs still open any section.
- [ ] STOP-Bang with the patient's part only reads "Faltan medidas del médico", not "Incompleto".
- [ ] "Imprimir" opens a picker for every role: Historia clínica, Consentimiento informado (with its state), and the doctor's signature (doctor only). The PDF contains exactly the ticked documents.
- [ ] An HC printed without the consent ticked has no consent page.
- [ ] The HC PDF and screen show a source per section and "Protocolo NeoSleep (Dra. Lorena)".
- [ ] Resumen lists the flags, suggests Indicado / Contraindicado, and the doctor confirms it. The confirmation is stored and audit-logged.
- [ ] All new copy is in en.json first, then pl and mx, and parity holds.
