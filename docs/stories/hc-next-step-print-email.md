## Refined User Story: Historia clínica as the final "Siguiente paso"

**Classification**: feature (new channel for health data: emailing the clinical history PDF)
**Raw input**: "tu jak juz wszystko jest uzupelnione powinno byc pobierz historia clinica dla pacjenta do druku - mozna wyslac mailem albo wydrukowac." (NEO-258)

### As a doctor, I want the patient card's "Siguiente paso" to offer the finished Historia clínica, so I can print it or email it to the patient without looking for it in Documentos.

### Stakeholder Notes
- 👤 User: the doctor at the end of intake. Today the panel ends in a disabled "Todo completado" button, and they have to go to Documentos → Historia clínica → Imprimir.
- 🏢 Client: the clinic hands the patient their record in one tap, which the patient sees as service quality.
- 🩺 Patient: gets a copy of their own clinical record (a NOM-004 right to a summary). A wrong recipient would leak health data, so the email may go only to the patient's own address on file.
- 🚀 NeoCRM/Platform: generic. "Send a rendered document to its subject" can be reused for other tenants' documents.
- ⚖️ Compliance: emailing health data. Attachment vs. expiring link and the patient's consent to email delivery need /legal (LFPDPPP sensitive data). Every send is audited.

### Medical-Industry Trend Check
- n/a: this is an internal workflow end-state. Patient-portal norms (secure link instead of attachment) are covered in the decision form.

### Acceptance Criteria
- [ ] Patient items all done (checklist loaded) → the panel shows a "Historia clínica" button instead of the disabled QR (PatientAsidePanel.spec).
- [ ] Print calls the same checklist print for `historiaEndo` as the Documentos tab (spec).
- [ ] "Send by email" posts to the API. The recipient is always the patient's own email on file; the client can't pass any other address (API integration test, real DB).
- [ ] The patient has no email on file → 422, and the UI shows the button disabled with a reason (API test + spec).
- [ ] Each send writes audit_log (entity patient, action historia_email) (API test).
- [ ] Print: same roles as Documentos (admin/doctor/manager). Email: doctor only, because it must be signed (D3). A rep gets 403 (API test).
- [ ] i18n keys go into en first, with parity in pl/mx.

### Decisions (decision form neo258-r1, 2026-10-06, all three "more")
- D1: the email carries a link valid for 7 days (`/d#<token>`), never the PDF. Every download is audited (migration 056 `document_link`).
- D2: three stages. First the patient's part (QR), then "Completar exploración" (open HC sections), then the Historia clínica (print / email).
- D3: email only signed by the doctor, so only a doctor sends it. Print can stay unsigned. The signed copy is stored, and the link serves exactly that copy.

### Hand-off
→ built in NEO-258
