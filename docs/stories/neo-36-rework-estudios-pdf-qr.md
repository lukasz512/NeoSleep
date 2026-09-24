## Refined User Story: NEO-36 rework — working PDFs, clinical questionnaires as Estudios, patient self-fill via QR

**Classification**: feature — a new public (unauthenticated) patient-facing flow over GDPR Art.9 health data, plus a data-model change to the already-shipped `endo_intake`.
**Raw input** (Łukasz, NEO-36 comment 2026-09-20, trimmed): "The PDF doesn't generate [toast: *Database error: withTenant* / *No se pudo generar el PDF*]; the STOP-Bang questionnaire doesn't generate either. The endoIntake tab should live in the Estudios section: *Add a study* should show a list — Polisomnografía, Antecedentes Médicos, Exploración de Cavidad Oral, Nuevo Cuestionario STOP-Bang. Antecedentes Médicos is a form the **patient** fills in, but the patient has no account — so when the doctor picks it a QR code appears carrying a link: a form generated for that patient, with name etc. already loaded, the patient answers, submits, it's saved to the DB and the doctor sees it. We need some external API so it can save outside a session."
Follow-up (2026-09-24): "refactor what exists, add better solutions, find the 3 must-have steps and polish them."

Builds on / supersedes parts of: [historia-endo-clinical-intake-and-printable-pdf.md](historia-endo-clinical-intake-and-printable-pdf.md), [ADR-022](../ADR-022-endo-intake-and-stop-bang-schema.md).

### As a partner dentist, I want every clinical questionnaire (medical history, oral exam, STOP-Bang) to be a dated study in the patient's Estudios list — the patient-reported ones filled by the patient on their own phone via a QR code — and each one printable as a working PDF, so that intake happens in the waiting room instead of chairside, and I have a dated, auditable history per patient.

### The three must-have steps

1. **PDFs actually generate** (bug + hardening). Root cause found: `@sparticuz/chromium` ships a Linux (Amazon Linux) binary only — `spawn ENOEXEC` on macOS (reproduced), and still failing on pwa-dev (Render, Ubuntu-based native Node runtime). The raw non-`AppError` is rewrapped by `withTenant` into an opaque `DatabaseError("withTenant")`, so the UI shows a DB error for what is a renderer/storage failure. `renderHtmlToPdf` had **never run for real**: it's mocked in every test, and Historia Endo / STOP-Bang are its first production callers. Secondary bug: `dataFields` fills only the first `[data-field]` match (`querySelector`), not all.
2. **Questionnaires move into Estudios.** The separate "Historia Endo" tab disappears; "Add study" becomes a type picker: Polisomnografía / Antecedentes Médicos / Exploración de Cavidad Oral / Cuestionario STOP-Bang. `endo_intake` (one row per patient, upserted) is split into two **append-only, dated** record types — medical history (patient-reported) and oral exam (dentist) — so every fill is its own entry with its own date, author and PDF, like `stop_bang_screening` already is.
3. **Patient self-fill via QR.** Doctor picks Antecedentes Médicos (or STOP-Bang) → a pending request is created and a QR code is shown, encoding a single-use, 24h link (`magic_link_tokens`, `entity_type='patient'`, SHA-256 hash stored, raw token only in the QR) → the patient opens a public page with their first name pre-filled, answers, accepts the health-data consent, submits → a public rate-limited endpoint validates the token, saves the record, burns the token → the doctor's list shows it moving from *pending* to *completed*. For STOP-Bang the patient answers S-T-O-P; the doctor completes B-A-N-G (BMI, age, neck, sex) and only then is the score final.

### Stakeholder Notes
- 👤 User: The dentist today reads ~15 medical-history questions aloud chairside or hands over paper; moving the patient-reported part to the patient's own phone in the waiting room removes that from chair time entirely. The dentist keeps the clinical part (oral exam, B-A-N-G measurements).
- 🏢 Client: Faster intake and a dated clinical history per patient is a concrete, demo-able benefit for a dental tenant; the STOP-Bang record directly supports NeoSleep's OSA-referral model (see original story's trend check).
- 🩺 Patient: **Direct.** Patient-reported medical history feeds a clinical procedure; the patient must see exactly what they're submitting, it must be attributed to them (not to the doctor), and a doctor must be able to see that the answers were patient-reported. Wrong-patient risk: a QR scanned by the wrong person — mitigated by single-use + 24h expiry + showing only the first name.
- 🚀 NeoCRM/Platform: The "tokenized public form for a non-account entity" mechanism is reusable (lead follow-up, post-treatment surveys, future HCP portal). Build the token + public-route layer generically (`questionnaire request` keyed by type), keep question sets hardcoded for v1 as already decided in the original story.
- ⚖️ Compliance: **Flag for `/legal`**. First time health data (Art.9) is submitted by an unauthenticated party; needs explicit consent text on the patient page, retention, and confirmation that name-only pre-fill is minimal enough. Also first public write endpoint touching `patient` — needs `/audit` (rate limit, token entropy, replay, enumeration, no PII in URL beyond the token).

### Medical-Industry Trend Check
- QR-code digital intake in waiting rooms is mainstream (reported 72% of healthcare organizations using/planning QR codes as of 2025; 15–20% lower wait times) — [QRocket](https://qrocket.io/blog/qr-codes-for-healthcare/), [Air Apps](https://airapps.co/blog/qr-codes-for-healthcare-patient).
- Security guidance converges on: the QR is only a pointer, protection comes from the backend — access control, encryption, audit logging; a static, forever-valid link to a PHI form is the anti-pattern — [QRocket](https://qrocket.io/blog/qr-codes-for-healthcare/), [the-qrcode-generator.com](https://www.the-qrcode-generator.com/qr-code-for-healthcare). Our per-patient single-use 24h token is the stricter variant of that.

### Acceptance Criteria
**Step 1 — PDF**
- [ ] Generating the Historia Endo and STOP-Bang PDFs succeeds on pwa-dev (Render) — verified on the deployed API, not only locally.
- [ ] Generating them succeeds locally on macOS (`pnpm start`) using a local Chrome/Chromium, without a Linux binary.
- [ ] A renderer or storage failure surfaces as a typed error with a real message (not "Database error: withTenant"); frontend shows a meaningful i18n message.
- [ ] Every element with a given `data-field` is filled (not just the first).
- [ ] At least one test renders a real PDF end-to-end (non-mocked renderer), skipped with a clear reason only when no browser binary is available.

**Step 2 — Estudios**
- [ ] Patient detail has no separate Historia Endo tab; Estudios "Add study" offers the four types.
- [ ] Each questionnaire fill creates a new dated row (never overwrites); list shows type, date, author/source (doctor vs patient), status, and a PDF action.
- [ ] Existing `endo_intake` rows are migrated into the new tables without data loss (new numbered migration; old migrations untouched).
- [ ] i18n parity en/pl/mx for every new key.

**Step 3 — QR self-fill**
- [ ] Doctor can create a patient-fill request for Antecedentes Médicos or STOP-Bang; a QR + copyable link is shown.
- [ ] Link valid 24h, single-use; an expired/used/unknown token shows a clear "link no longer valid" page and leaks no patient data.
- [ ] Public page shows only the patient's first name and the clinic name; submits answers + consent; no session required.
- [ ] Submission is saved with `source='patient'`, request marked completed, token burned, audit-log row written; doctor's list updates to *completed*.
- [ ] Public endpoints are rate-limited; token stored only as a hash.
- [ ] STOP-Bang via QR: patient answers S-T-O-P; score is only shown once the doctor completes B-A-N-G.
- [ ] Integration tests hit real Postgres (no DB mocks).

### Open Questions
- [ ] Consent text shown to the patient on the public page — placeholder until `/legal` provides it (does not block building, blocks go-live).
- [ ] Render: fix Chromium on the native runtime vs. switch the API service to a Docker runtime vs. an external rendering service — decided during Plan after reproducing in a Linux container.

### Hand-off
→ `/arch assess` — data-model split of `endo_intake`, `questionnaire_request` + token design (ADR-023)
→ `/legal` — Art.9 consent text for the patient-facing page (go-live blocker, not build blocker)
→ `/audit` — public write endpoint review before push
→ `/dev` — implementation in three commits, one per step
