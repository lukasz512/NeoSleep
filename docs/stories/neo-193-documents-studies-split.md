# NEO-193 — Documentos vs Estudios split (after the talk with Dra. Lorena)

## Ask
Dra. Lorena (NeoSleep, MX): Historia Clínica = Exploración de cavidad oral + Historia Clínica together, following her paper form "Historia Clínica Odontológica". Both it and the Consentimiento informado should move to Documentos, which might be renamed "Legal". She also asked to drop height from STOP-Bang B and to fix "Database error: completeStopBang".

## Legal review (/legal, 2026-09-30)
- **NOM-004-SSA3-2012** (expediente clínico): the historia clínica (§6.1) and the cartas de consentimiento bajo información (§10.1) are both part of the patient's clinical record. So "legal vs medical" is a false split. Every document in the expediente carries legal weight, and all of them are health data (LFPDPPP sensitive data).
- The workable split is **signed clinical documents** (Documentos) vs **results of studies** (Estudios). That supports Lorena's move, but not the name "Legal": the tab name should not suggest the content isn't clinical.
- Must-haves for the merged Historia Clínica (NEO-194):
  - Every note carries the author's full name and signature, plus cédula profesional (§5.10).
  - No erasures: corrections are made by addendum (§5.11). Our append-only tables already do this.
  - Retention is at least 5 years (§5.4).
- **Risk flagged to the client, not acted on:** §10.1.1 requires witnesses' names and signatures on the carta de consentimiento. Our consent form has none. The clinic's lawyer should confirm.

## Decisions (decision form neo193-r1, Łukasz 2026-09-30)
| # | Question | Answer |
|---|---|---|
| D1 | Tab split | Documentos = consent + the Historia Clínica parts (Cuestionario médico, STOP-Bang, Exploración, Historia Clínica); Estudios = PSG, imaging, other study uploads. Cuestionario and STOP-Bang become HC sections in NEO-194 |
| D2 | Rename to "Legal" | Skipped → stays "Documentos" (legal advice: no) |
| D3 | Merged 13-section Historia Clínica | Separate ticket: **NEO-194** |
| D4 | Height in STOP-Bang B | Height captured once in HC vital signs; B asks only weight (NEO-194, needs the HC vitals) |
| D5 | Consent witnesses | Not decided. Raised by the legal review, not by Lorena |

## What NEO-193 ships
- **Category, hoisted.** Each checklist item carries `category: "document" | "study"`, derived from its group in one place (`CATEGORY_FOR_GROUP`, API): consent/patient/doctor → document, results → study. It is not a new table or column, because the fill_mode config already decides the group.
- **One panel for both tabs.** `PatientChecklistPanel` (renamed from `PatientStudiesPanel`) takes a `category` prop. Documentos shows the document items with the patient QR and email. Estudios shows the results plus "Otros estudios" uploads. Documentos is no longer the flat, duplicate file list (`EntityDocumentsPanel` stays for users/HCO/HCP).
- **Tabs and links.** Documentos sits before Estudios. The summary card, side panel and QR open the item's own tab (`CHECKLIST_TAB`).
- **STOP-Bang BMI fix.** A height/weight pair whose BMI falls outside 5–99.9 (e.g. 100 cm + 100 kg = 100) is rejected with the range message in the app and a 422 from the API. Before, it overflowed `bmi NUMERIC(3,1)` and surfaced as "Database error: completeStopBang".
