# ADR-024: Estudios as a per-patient checklist, one QR per patient, consent signed on the phone

## Status
Accepted (2026-09-25, NEO-36 part 2). Builds on [ADR-023](ADR-023-clinical-questionnaires-and-patient-self-fill.md) and [ADR-021](ADR-021-document-template-entity-type-assignment.md). Story: [neo-36-estudios-checklist-redesign.md](stories/neo-36-estudios-checklist-redesign.md).

## Context

ADR-023 made the clinical questionnaires dated studies that a patient can fill via a single-use QR
link. After using it, Łukasz (2026-09-25) wanted the Estudios tab to answer one question at a
glance: *what is still missing for this patient?* His requirements:

- The tab lists **every document assigned to patients in the Documents admin** plus
  polysomnography. The groups run consent → what the patient fills → what the doctor fills →
  polysomnography, and PSG is always last.
- Each row shows a title, a status, a QR for the patient and a print PDF. The PDF is pre-filled
  with the patient's data and has a signature space. Done rows are highlighted.
- The informed consent is **signed on the patient's phone**, not only printed.
- There is **one QR for everything the patient still has to do** (consent → Antecedentes →
  S-T-O-P).
- "Agregar estudio" uploads a file from the doctor's disk, with a title and notes. It becomes a new
  item or completes an existing one (a PSG report, a scanned paper consent).
- The Details tab shows one status icon per item.
- Health data is visible to **admin and doctor only** (2026-09-25). Superseded 2026-09-26 (NEO-83):
  **managers also see and edit the patient's studies**, and every read is audited — see §6.

## Decision

### 1. The checklist is derived, not stored
`GET /patient/:id/checklist` (`queries/patientChecklist.ts`) computes the list on every request.
There is no checklist table.

- **Items** are the rows of `platform.document_template_entity_type` for `entity_type = 'patient'`,
  ordered by the new `sort_order` and grouped by the new `fill_mode`
  (`consent | patient | doctor | external`, migration `031_patient_checklist.sql`). **Polysomnography**
  is a built-in item that always renders last. An admin sets the group and position in the
  Documents editor (the "Completed by" and "Position" fields). Adding a document to the checklist
  takes no code change, which satisfies architecture rule 2.
- **Status** comes from each item's *binding*:

  | Item | Done when | Other states |
  |---|---|---|
  | `medicalHistory`, `oralExam` | a migration-030 record exists (latest wins) | `pending_patient` while a QR link for it is open |
  | `stopBang` | the latest record has a `score` (B-A-N-G done) | `partial`: S-T-O-P answered, B-A-N-G missing |
  | `fill_mode = consent` | a non-withdrawn `consent` row with `purpose = <templateKey>` | `pending_patient` |
  | polysomnography | a sleep study at `study_complete` or later, or an attached upload | `partial` while a study is in progress |
  | any item | a file attached to it via "Agregar estudio" | — |

  An item a future admin adds with no form binding falls back to its `fill_mode`: print, sign on
  paper, upload.
- **History.** Every fill, signature and upload for an item is returned newest-first under that item.
  The UI shows one row per item and folds the history beneath it.

### 2. Uploads reuse `file_attachment`
`POST /patient/:id/studies/uploads` accepts PDF, JPG or PNG files up to 15 MB. It stores the file
through the existing storage path and writes a `file_attachment` row on the patient with
`metadata = {document_type: 'study_upload', title, notes, checklist_item?}`.

- With `checklist_item` set, the file completes that item.
- Without it, the file shows up under "Other files".

We added no new table: a doctor's upload is a file with a description, and `file_attachment` already
carries audit, storage and tenant isolation. Deleting an upload (`DELETE …/uploads/:id`) is limited
to admins.

### 3. Print PDFs are streamed, never stored
`POST /patient/:id/checklist/:key/print` renders the item's template, pre-filled with the patient,
clinic, doctor, date and, when there is one, the latest answers. Unanswered fields stay blank so
they can be filled by hand. Every template has a signature box.

- The PDF is **streamed to the browser and not stored**. A blank or partly-filled form is not a
  record, so storing every print would only pile up health-data copies.
- The one exception is a signed consent: `print` returns the stored signed PDF (a signed URL).

The ADR-023 per-record PDF route is removed. Its job is now `print` with an optional `recordId`.

### 4. One QR per patient: a request holds ordered steps
`questionnaire_request` gains `items TEXT[]` and `completed_items TEXT[]`, plus the kind `bundle`.
The tenant function is regenerated (§6).

- `POST /patient/:id/questionnaire-requests` with no `items` bundles every consent item and every
  patient item that is not done yet, in checklist order.
- A per-row QR sends a single item.
- Creating a request cancels any open request that covers an overlapping item, so only one live
  link per item exists.
- The public lookup returns `steps[]`. The patient page is a stepper, and **each step is saved on
  its own**, so a patient who stops halfway keeps what they finished.
- The link dies (`used_at`) once every step is complete. The 24-hour expiry and the 32-byte token
  in the URL fragment, stored hashed, are unchanged from ADR-023.

### 5. Consent signed on the phone
A consent step shows the current `document_content_version` HTML for the patient's locale. The HTML
is **sanitized on the server** to a tag allowlist (`p br strong em u ul ol li`, no attributes) before
it reaches the public page.

The patient signs with a finger. The PNG data URL is validated the same way as in the partner
invite: PNG only, ≤ 300 KB. The JSON body limit is raised to 600 KB for this one public route only.

Submitting a consent runs in three phases, the same pattern as the partner-invite signature
(`commands/invitePractitioner.ts`):

1. **tx1:** lock the request and check the step is still open.
2. **No transaction:** render the PDF with the signature embedded (`renderHtmlToPdf` gains
   `dataImages`, which accepts `data:image/png` only and is allowed by the page lockdown), then
   upload it.
3. **tx2:** re-lock. Insert the `file_attachment` (`signature_method: 'drawn'`,
   `content_version_id`) and a `consent` row (`legal_basis 'consent'`, `purpose = <templateKey>`,
   version `patient-self-fill-2026-09-25`). Write the audit entry and mark the step complete.

If tx2 fails, or a concurrent submit already signed the step, the upload is deleted, so no orphan
signed PDF is left behind.

### 6. Roles and schema
- Every checklist, print, upload, questionnaire, sleep-study and document route, including the
  Documents tab list (`GET /patient/:id/documents`), requires `requireStudyRole` (admin + doctor +
  **manager**, Łukasz 2026-09-26, NEO-83; he chose to open the Documents tab too). A sleep study's
  hard delete stays admin-only. Rep, KAM and MSL get none of it. The patient must also pass
  the territory check in `GetPatientByIdQuery`.
- **Every read is audited.** Managers are not clinicians, so opening Art. 9 data to them needs an
  access trail (GDPR Art. 5(2) accountability, Art. 32; LFPDPPP). Each successful health-data read
  writes an `audit_log` row (`action = 'read'`, `metadata = {view, patient_id, role}`) via
  `AuditHealthDataReadCommand`, for every role. A 403/404 writes nothing. Changes were already
  audited by their commands. `read` rows are an access trail, not a change, so the History tab
  leaves them out (`getAuditLogForEntities`).
- The OrthoApnea tab needs a sleep-study id for other roles. It gets one from
  `GET /patient/:id/sleep-study-ref`, which returns the id only.
- The PWA mirrors this per tab: Studies, Documents and the Details "Estudios" card for `STUDY_ROLES`
  (`apps/pwa/src/config/questionnaires.ts`).
- `create_tenant_schema()` is regenerated with `scripts/generate-create-tenant-schema.ts`, as in
  ADR-023 §4. The CI parity job enforces this.

## Consequences

- **Good.** A clinic changes what's on the checklist without a deploy. The doctor sees what's
  missing on the Details tab. One scan covers the whole patient intake. A signed consent is a real
  consent record with its PDF, version and audit trail.
- **Good.** No new tables. Uploads and signatures reuse `file_attachment` and `consent`.
- **Cost.** The checklist is computed from about 7 queries per request. That's fine at one patient
  per page. A list view that shows checklist status for many patients would need a denormalized
  status or a batch query.
- **Cost.** `fill_mode`/`sort_order` live on the platform-level assignment, so every tenant gets the
  same order. A per-tenant override is deferred until a second tenant needs one.
- **Deferred.** Removing an item as "not applicable" for one patient (Łukasz: "later").
- **Open (legal).** The patient-facing consent text was drafted with `/legal` (LFPDPPP express
  written consent for sensitive data; GDPR Art. 9(2)(a) for PL). Counsel still has to sign it off
  before real patients use it, and the clinic, as data controller, needs its own aviso de
  privacidad.
- **Open (legal, NEO-83).** In the same counsel review: manager access to patient studies and documents (Łukasz confirmed he wants it, 2026-09-26). What
  counsel has to confirm: (1) the purpose and legal basis for a non-clinician processing Art. 9 data
  (GDPR Art. 9(2)(h) + 9(3) requires a person under a duty of secrecy; LFPDPPP needs the purpose
  named in the aviso de privacidad); (2) a written confidentiality obligation for every manager
  account; (3) the patient consent / aviso text naming this recipient. The technical side
  (role-limited, territory-checked, read-audited) is done.
