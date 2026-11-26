## Refined User Story: Estudios as a per-patient checklist of documents and studies

**Classification**: feature. It reshapes the Estudios tab and the Details view and adds a new record type (a file the doctor uploads, with a title and notes). Builds on [neo-36-rework-estudios-pdf-qr.md](neo-36-rework-estudios-pdf-qr.md).

**Raw input** (Łukasz, 2026-09-25, translated from Polish):
> Details and forms get merged: on the Details view I see icons for all the studies in the list.
> In Estudios I open a list of the documents assigned in the Documents admin tab (consents, the consentimiento informado) plus every study. Order them so they make sense: first what matters to the dentist, polysomnography last. I expect 4–5 documents.
> Each row shows: title, status, "show QR to the patient", and "download PDF for printing" (pre-filled patient data plus room for a signature).
> Once a study is done, its whole tile is lightly highlighted, so it's easy to see what's still missing. Later, the doctor can remove a study that doesn't apply.
> "Agregar estudio" uploads a file from the doctor's disk. The doctor gives it a title and notes/observations, and it becomes a file on this patient. It can sit in the studies table with a different status.
> A study meant for the doctor opens a form that the doctor fills in on the spot: no QR, but printable.

### As a partner dentist, I want each patient's Estudios tab to be a fixed, ordered checklist of every consent, questionnaire and study this patient needs, showing which are done and which are missing, and offering a QR or a print PDF for each, so that I can see at a glance what's left and finish it in the right order.

### Stakeholder Notes
- 👤 **User.** The dentist today has to remember which forms exist. A checklist with a done/missing state per item turns "what am I missing?" into a single glance. The Details view repeats the same state as icons.
- 🏢 **Client.** The checklist comes from the Documents admin (ADR-021 template → entity-type assignment), so each tenant or clinic decides what appears. Nothing is hardcoded. Architecture rule 2 (config-driven) holds.
- 🩺 **Patient.** Direct effect: missing consent or medical history before a procedure is a patient-safety and liability gap. A visible "missing" state lowers that risk. Print PDFs with a signature line keep paper consent valid.
- 🚀 **NeoCRM/Platform.** A generic "checklist of assigned document/study types per entity" pattern that other tenants could reuse, for example onboarding documents for a lead.
- ⚖️ **Compliance.** Consent PDFs signed on paper need their signed copy stored against the patient. The upload flow covers that. Health data is admin/doctor only (decided 2026-09-25; since 2026-09-26 managers see and edit the studies too, with every read audited — NEO-83, ADR-024 §6). Doctor-uploaded files are health data too, so the same role restriction applies. `/legal` was consulted about the patient consent text (see ADR-023 follow-up).

### Medical-Industry Trend Check
- Not applicable. The workflow shape comes from the partner dentist's own paper process; the relevant intake/QR trend check is already in the previous story.

**Status**: implemented 2026-09-25 on `worktree-neo-36-historia-endo-estudios-qr` — design in [ADR-024](../ADR-024-patient-estudios-checklist.md). Not-applicable removal deferred; consent text awaits counsel sign-off.

### Acceptance Criteria
- [x] Estudios lists one row per checklist item, in a fixed clinically logical order, with polysomnography last.
- [x] Each row shows its title, a status, "QR for the patient" (only where the patient fills the form) and "PDF to print" (patient data pre-filled, signature space).
- [x] A completed row is visibly highlighted; missing rows are not.
- [x] Doctor-filled items open a form in place: no QR, printable.
- [x] "Agregar estudio" uploads a file with a title and notes. It shows up in the same list with a distinct status.
- [x] The Details view shows one icon per checklist item with its done/missing state.
- [x] Only admin and doctor see any of this. (Changed by NEO-83: managers too, read-audited.)

### Decisions (Łukasz, 2026-09-25)
- **Scope and order.** Every document assigned to the patient in the Documents admin appears, grouped as:
  1. the consent (consentimiento informado)
  2. what the patient fills in (Antecedentes médicos, STOP-Bang)
  3. what the doctor fills in (Exploración de cavidad oral, Historia Endo)
  4. Polisomnografía, always last
- **Historia Endo** goes in the doctor group: a form the doctor fills in and prints, signed on paper.
- **Consent is "done"** once the patient signs it on their phone. The QR flow shows the consent and captures a signature, and a signed PDF is generated. Printing stays available.
- **One row per item**, with its status taken from the latest fill. Earlier fills expand underneath.
- **One QR for everything the patient has to do.** The patient goes through consent (with signature) → Antecedentes → S-T-O-P in one session, and each item still has its own QR.
- **Configuration.** When the admin assigns a document to the patient entity in the Documents admin, they also pick who fills it (consent / patient / doctor / external result) and its position in the order. Adding a new document takes no code change.
- **Upload.** "Agregar estudio" either creates a new ad-hoc item (title + notes) or attaches to an existing item and completes it (a PSG report → Polisomnografía; a signed scan → the consent).
- **Details view.** A "Estudios" card in the Details tab with one status icon per item (not a strip under the name).
- Removing an item as "not applicable" is deferred.
- **Done rows (follow-up, 2026-09-25, chosen from a 3-variant mockup: "szyna").**
  - A done item is no longer filled green. Instead, a status rail on the left carries the icon and the color.
  - A done row shows its result in place of Llenar / Imprimir / Subir:
    - yes/no counts, plus chips for the "yes" answers
    - STOP-Bang score, risk and S-T-O-P-B-A-N-G letters
    - PSG: AHI / SpO₂ nadir / ODI on the AASM severity scale
    - signed consent: a link to the PDF
    - attached file: the file and its notes
  - Everything else (Ver, Imprimir, Nueva versión, Subir archivo, Historial) moves under "⋯".

### Open Questions (asked 2026-09-25; answered above)
- [x] The exact list and order of items, and whether Historia Endo (root-canal consent) belongs in a sleep-dentistry checklist.
- [x] How a consent counts as "done": printed, signed and the scan uploaded, signed on the patient's phone, or the doctor ticks it.
- [x] One row per item with its history folded underneath, or every fill as its own row.
- [x] Where the Details view icons sit, and whether clicking one jumps to the item.
- [x] Does an upload always create a new ad-hoc row, or can it also complete an existing item (for example, a PSG report upload completing the "Polisomnografía" row)?
- [x] Removing an item as "not applicable" is deferred ("later"). Confirm it's out of scope for this iteration.

### Hand-off
→ `/ux` for the row/tile and Details-icon layout, after the answers
→ `/arch assess`: the checklist source (manifest + ADR-021 assignment + built-in clinical forms) and the uploaded-study record (reuse `file_attachment` with metadata vs. a new table)
→ `/dev`
