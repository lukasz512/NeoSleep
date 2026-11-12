## Refined User Story: Device order — upload the 3D scan (STL) file (NEO-262)

**Classification**: feature. The change touches the wizard, the shared order model, the API, file storage and what we send to a partner. It also moves patient data to a third party.
**Raw input**: "In the PWA I still can't add the 3D scan file! Why?! Did this pass the tests like this?!" (Łukasz, 2026-11-10)

### As a doctor ordering an OrthoApnea device, I want to attach the intraoral scan file (STL) in the order wizard so that the lab gets the bite without a separate upload in OrthoApnea's portal

### Stakeholder Notes
- 👤 User: today the "Registro dental" step offers impression, scanner name or scanner platform. The "upload file" path shows only a "coming in a follow-up update" notice, so a doctor with an exported STL has to log into OA's portal. Since NeoSleep uses one shared OA account, a doctor can't do that at all.
- 🏢 Client: an order without a bite stalls in OA as "more information pending" (statusId 3). That delays the device and the revenue.
- 🩺 Patient: indirect but real. A missing or wrong scan means a late or ill-fitting splint. The file must reach the right order, and the upper and lower arches must not be swapped.
- 🚀 NeoCRM/Platform: the storage and upload half is partner-agnostic (any lab provider adapter can read the stored files). Only the multipart encoding is OA-specific, so it lives in the OA adapter.
- ⚖️ Compliance: an intraoral scan is health data about an identifiable patient (GDPR art. 9, LFPDPPP "datos sensibles"). It goes to OA under the existing partner DPA. We store a copy in a private bucket, so retention and access need an explicit decision (see Open Questions).

### Medical-Industry Trend Check
- n/a: this is a partner-integration gap, and the format is dictated by OA's own portal (docs/partners/orthoapnea-order-rules.md §1.5 and §3.2).

### Technical constraint (drives the design)
- The API runs on Cloud Run, which caps an HTTP/1 request at 32 MiB. Full-arch STL files are commonly 10 to 60 MB each, so the browser uploads straight to Supabase Storage with a signed upload URL that the API issues. The API only receives storage paths, and it downloads the files when it builds OA's multipart. API → OA has no such cap.
- Supabase's per-file upload limit depends on the plan (50 MB on Free). The UI enforces the same per-file maximum, which is configurable, so a doctor gets a clear message instead of a storage error.

### Acceptance Criteria (testable)
- [ ] The "Registro dental" step offers an "Upload scan file" option. With it chosen, the doctor can add one or more files (typically upper + lower). The deferred notice is gone.
- [ ] Accepted extensions are .stl, .ply and .obj. A 0-byte file, another extension, or a file over the per-file maximum is rejected inline with an i18n message (EN/PL/MX), and nothing is uploaded.
- [ ] Each file shows upload progress and can be removed before submit. Submit stays disabled while an upload is running.
- [ ] Choosing the upload option with no file is a validation error (`required`), the same way an empty scanner pick is today.
- [ ] A saved draft keeps the uploaded files (by storage path). Reopening the draft lists them.
- [ ] On submit, the API checks that every path belongs to this tenant and this order's upload prefix, then sends each file to OA as a `file` part named per rules §3.2 (MODEL, type 4). A path from another tenant or plan → 400, and nothing is sent to OA.
- [ ] `orthoApneaTreatmentForm` with files produces `treatmentDTO` + one `file` part per scan. Without files, the output is unchanged (byte-for-byte the current shape).
- [ ] The API test runs against the real test DB and a stub OA HTTP server. It asserts the multipart OA received: field names, filenames and bytes.

### Open Questions (→ /decision-form)
- [ ] Do we keep our copy of the scan after OA has it (as part of the patient's record), or delete it once OA confirms the order?
- [ ] May we send ONE real test order with a dummy STL from dev to OA to prove the end-to-end path? OA orders are real and billable.

### Hand-off
→ `/dev feat device-order-stl-upload`: the scope is clear; the storage design is above.
