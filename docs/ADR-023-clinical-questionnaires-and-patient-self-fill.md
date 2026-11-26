# ADR-023: Clinical questionnaires as dated studies + patient self-fill via single-use link

## Status
Accepted (2026-09-24, NEO-36 rework). Partially supersedes [ADR-022](ADR-022-endo-intake-and-stop-bang-schema.md). Extended by [ADR-024](ADR-024-patient-estudios-checklist.md): Estudios becomes a per-patient checklist, one QR carries several steps (incl. a phone-signed consent), and the per-record PDF route is replaced by a streamed print PDF.

## Context

NEO-36 shipped Historia Endo as a separate patient tab backed by `endo_intake`: one row per patient,
upserted in place (ADR-022). Once the partner dentist used it, three things were wrong:

1. **PDFs never generated.** Both PDF buttons failed on pwa-dev with "Database error: withTenant". The
   renderer (`services/documentRenderer.ts`) had never actually run: every spec mocked it.
2. **Wrong place and wrong model.** Łukasz asked for the questionnaires to be *studies*. "Add study"
   should offer Polisomnografía, Antecedentes Médicos, Exploración de Cavidad Oral and Cuestionario
   STOP-Bang. Each fill should be its own dated entry. Upserting in place loses the patient's history.
3. **The patient should answer their own history.** The patient has no account. The doctor shows a
   QR code, and the patient fills the form on their phone, pre-filled with their name. The answers
   must be saved outside any staff session.

Decisions made by Łukasz (2026-09-24):
- every fill is its own dated record
- the link is valid for 24 hours and works once
- for STOP-Bang, the patient answers S-T-O-P and the clinician completes B-A-N-G.

## Decision

### 1. PDF rendering launches a browser that can actually run
`@sparticuz/chromium` only unpacks its bundled shared libraries (libnspr4, libnss3, fonts) when it
believes it runs on AWS Lambda. It decides this once, at import time. Render's native Node runtime is
not Lambda, so the launch failed with `libnspr4.so: cannot open shared object file`. On macOS the
Linux-only binary fails with `spawn ENOEXEC`. `withTenant` then rewrapped the raw `Error` as an
opaque `DatabaseError`.

`resolveBrowserLaunch()` chooses the browser in this order:
1. `CHROME_EXECUTABLE_PATH`, if set
2. a local Chrome/Chromium/Edge/Brave when not on Linux
3. on Linux, `AWS_LAMBDA_JS_RUNTIME` is set **before** a dynamic import of `@sparticuz/chromium`.

This was verified in a `node:20-bookworm` amd64 container: it fails without the flag and renders
with it. Renderer and Supabase Storage failures now throw `AppError`s (`DocumentRenderError`,
`PartnerServiceError`), so the real cause reaches the UI. A non-mocked spec renders real PDFs.

### 2. Append-only questionnaire tables (migration 030)

| Table | Filled by | Notes |
|---|---|---|
| `medical_history_questionnaire` | staff **or** patient | `source` ∈ staff/patient; `recorded_by` NULL when the patient filled it; `request_id`, `consent_accepted_at`, `consent_version` |
| `oral_exam` | staff only | a clinical finding, never self-reported; optional `tooth` |
| `stop_bang_screening` (kept) | patient answers S-T-O-P, staff answers B-A-N-G | B-A-N-G nullable; `score` is `GENERATED` and NULL until all 8 are answered; `source`, `request_id`, consent columns |

- Existing `endo_intake` rows are copied into the two new tables, split by half and only where that
  half was actually answered.
- `endo_intake` stays in place, unused. A later migration drops it once the copy is verified on dev
  and prod.
- Every staff command and query first resolves the patient through `GetPatientByIdQuery`, which
  enforces territory scope. The 026 read and PDF paths skipped that check.

### 3. `questionnaire_request`: the patient's single-use link
- Columns: `id, patient_id, kind (medical_history|stop_bang), token_hash UNIQUE, expires_at, used_at,
  cancelled_at, created_by`.
- The token is 32 random bytes in base64url (`utils/generateToken.ts`). Only its SHA-256
  (`utils/hashToken.ts`) is stored. The raw token exists only in the QR code and the URL, so
  "show QR again" issues a new link.
- Issuing a new link cancels any pending link of the same kind for that patient.
- **Why a dedicated table and not `magic_link_tokens`:** the request has a kind and a lifecycle
  (pending → completed / cancelled / expired). The doctor's Estudios list shows that state.
  `magic_link_tokens` is a login primitive and has neither.
- **Public API** (`routes/public.ts`, separate rate limits for reads and submits):
  - `GET /public/questionnaire/:token` returns the kind, the patient's **first name only** and the
    clinic name.
  - `POST` does the following in a single transaction:
    1. `SELECT … FOR UPDATE` on the request
    2. validate with the same validators the staff commands use; the patient must answer every question
    3. insert with `source='patient'` and the consent stamp
    4. set `used_at`
    5. write an audit row (`user_id` NULL, `legal_basis='consent'`, IP and user agent)
  - An unknown, used, cancelled or expired token all return the same `410 LINK_INVALID`.
- **Page:** the public PWA route `/q#<token>` uses the public layout and needs no login.
- **Where the token travels (hardened after the pre-push `/audit`):**
  - The token rides in the URL **fragment**. Browsers never send a fragment to any server, so it
    stays out of GoDaddy/Render access logs, Google Analytics and the Referer header.
  - The public endpoints take it in the **POST body**: `POST /public/questionnaire/lookup` and
    `/submit`. It never appears in a request path.
  - The page is excluded from GA page tracking.
  - The diagnostics reporter strips the fragment from the URL it records.
- **Polling:** the doctor's QR dialog polls every 15 s for at most 15 min. The clinic's devices share
  one public IP, and so the API's per-IP rate limit.
- **Rendering lockdown:** Chromium runs unsandboxed on Render. Page JavaScript is disabled, and every
  request except `data:`, `about:` and the Google Fonts hosts is aborted.
- **PDF phases:** the PDF is rendered and uploaded outside any DB transaction. The attachment row is
  written afterwards; if that fails, the upload is deleted.

### 4. `create_tenant_schema()` is regenerated, not hand-edited
- `scripts/generate-create-tenant-schema.ts` rebuilds the function from a pg_dump of a from-scratch
  `neosleep` schema. This is the same technique 027 used by hand.
- It fails loudly on any statement kind it doesn't know how to translate.
- Migration 030 appends its output. CI's `check-tenant-schema-parity` confirms the result, and running
  the function twice is safe.

## Consequences
- The Estudios list merges `sleep_study` rows with clinical records, newest first. Links still waiting
  for the patient are pinned above the list.
- STOP-Bang shows the standard risk band: 0–2 low, 3–4 intermediate, 5–8 high.
- The Historia Endo PDF is built from one record plus the patient's latest record of the other half,
  so a single form still prints both sections.
- **Open item (blocks go-live, not the build):** `/legal` has to write the health-data consent text
  shown to the patient. The i18n key `app.questionnaire.consent` currently holds a placeholder. Bump
  `PATIENT_CONSENT_VERSION` when the text changes.
- **Open item:** Render Free has 512 MB of memory. One headless Chromium plus Node should fit for
  single renders (`MAX_CONCURRENT_RENDERS = 2`), but this is unmeasured on the real instance. Watch the
  first renders on pwa-dev.
- **Rejected alternatives:**
  - Client-side `window.print()`: no stored, audited copy of the document.
  - An external rendering SaaS: sends Art. 9 health data to another processor.
  - Switching Render to a Docker runtime: a bigger infrastructure change than the one-flag fix needs.
