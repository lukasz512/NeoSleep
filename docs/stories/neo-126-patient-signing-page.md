# NEO-126 — Patient signing page: app chrome + secure document signing

**Ticket:** NEO-126 · **Surface:** `apps/pwa` public page `/q#<token>` (PatientQuestionnaireView) + `POST /public/questionnaire/*`

## Problem
The QR page showed the consent as a plain scroll box inside the login card. It did not look like the app and did not feel like signing a document.

## Decisions (Łukasz, decision form 2026-09-27)
| # | Question | Decision |
|---|---|---|
| A1 | How the document is read | A card with a document icon opens an HTML reader that looks like a sheet of paper (bottom sheet on phones, dialog on desktop). No PDF before signing. |
| A2 | Force reading | Yes. "Go to signing" unlocks after the last line has been on screen. Stored as `read_to_end` in the consent and audit metadata. |
| A3 | Copy after signing | Yes. The thank-you screen offers "Download a copy (PDF)". The server hands the signed PDF back once in the submit response, so the token is never accepted again. |
| B1 | Shown at the signature | "You are signing as <full name> · <date>", an "I have read and accept" checkbox, and a "Secure link · just for you" chip. No confirmation number. |
| B2 | Full name | Only while a consent is still to be signed. Questionnaire-only links keep the first name. |
| C1 | Avatar menu | Language, theme, privacy ("How we protect your data" + privacy policy + website), contact the clinic (e-mail / phone), "How does this work?". No "End and clear". |
| C2 | Avatar | Square, initial, green "verified link" dot. |
| C3 | Logo | The tenant logo from `app_config`, with a fallback to NeoSleep. |
| D1 | Scope | The whole link: the bar, avatar and motion on every step. The reader and signing apply to the consent step. |

## Acceptance criteria
1. The page shows the app backdrop with the logo top-left and the patient's avatar top-right. The avatar opens the app's account menu in patient mode, with no password, log-out or install actions.
2. The consent is a document card. Tapping it opens the reader with a progress bar. The continue button stays disabled until the end has been reached.
3. The signing area appears only after reading. It shows who is signing and when, plus the accept checkbox. Sign stays locked until there is a signature and the box is ticked, and the missing item is named inline.
4. The submit call sends `readToEnd`. The consent row stores `read_to_end`. The response carries `signed_copy` (a PDF) for consent steps only.
5. A consent-only link ends on "Document signed" with a receipt (document, time, clinic) and a PDF download.
6. The lookup returns `patient_name` only while a consent is open, plus `clinic_phone` and `website_url`.

## Compliance notes
- The full name is exposed to whoever holds a live consent link (B2). This is accepted because the signer must see whose name they are signing. The signed PDF (full name, date of birth) goes back only in the response to the signature that created it.
- `read_to_end` is evidence only. It is never used for access decisions.
