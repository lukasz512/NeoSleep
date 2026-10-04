# Clinical forms — Dra. Lorena feedback, round 1 (NEO-231)

Source: Dra. Lorena's review (screenshots + voice note, 2026-10-04) and decisions D1–D5 in decision form
`lorena-feedback-r1`. Clinical reference: `docs/clinical/protocolo-atencion/README.md`.

## User story
As a NeoSleep dentist filling a patient's Historia clínica, I want the forms to follow Dra. Lorena's
protocol, so that one place holds the whole history and I don't type the same data twice.

## Acceptance criteria
1. **Consent without Biologix.** The informed consent's manufacturer sentence names only OrthoApnea
   (en/pl/mx). Already signed consents are stored PDFs and do not change.
2. **No "Diente".** The oral exam (dialog + `oralExam` and `historiaEndo` PDFs) has no tooth field.
   The `oral_exam.tooth` column stays for old rows; new records don't send it.
3. **Height once (D1).** `patient.height_cm` (100–230) lives on the patient card. The STOP-BANG form shows
   only Peso (+ cuello). The API takes the height from the patient when the form sends only the weight, then
   computes BMI and B. If the patient has no height, the form shows a hint and B is answered by hand.
4. **One Historia clínica tile (D2).** In Documentos, Antecedentes médicos · STOP-BANG · Exploración ·
   ATM are tabs of one "Historia clínica" tile with an "x de 4" counter. Imprimir prints the HC PDF
   with every section. The patient list shows one HC chip instead of AM/SB/EO/HC (done when all 4 are done).
5. **ATM tab (D3).** A new `tmj_exam` record: 5 findings × Derecho/Izquierdo (dolor a la palpación,
   ruidos articulares, limitación de apertura, desviación en apertura, dolor muscular) + apertura máxima
   0–80 mm. A front-view skull drawing highlights the side(s) marked. The old oral-exam "Evaluación del
   ATM" Sí/No is no longer asked, but old answers stay visible read-only. The HC PDF prints the ATM table.

## Defaults (decided without asking; tests prove them)
- Weight without patient height → the API rejects it the same way as today ("height_cm and weight_kg
  together"). The form never sends it, because Peso is disabled until the card has a height.
- A height typed on an old screening stays on that screening (history is not rewritten).
- An ATM record needs at least one finding or the opening measurement.

## Out of scope
- Recursos: Lorena's deck (D4) gets its own ticket.
- Round 2 (D5): protocol gaps → mockup for Lorena's approval.
