## Refined User Story: Sender-visible email language picker

**Classification**: feature
**Raw input**: Mails go in the user's (recipient's) language, but the picker must be visible to the person sending the message (CORE-268).

### As a doctor or rep sending a patient email, I want to see the language the mail will go in, preselected from the patient's language, and change it for this one send, so that the patient reads it in a language they understand and I never send blind.

### Stakeholder Notes
- 👤 User: the sender sees "Email language" in the send dialog and in the Historia clínica sign-and-send step; no hidden derivation.
- 🏢 Client: fewer wrong-language mails to patients; a bilingual patient can still be written to in the other language.
- 🩺 Patient: clinical instructions and consent links arrive in a language they read; no safety effect beyond comprehension.
- 🚀 NeoCRM/Platform: `identities.language` stays the single default (CORE-261); the picker is a per-send override, reusable by other send sites later.
- ⚖️ Compliance: the language of a consent mail matters for informed consent; the override is not stored on the identity.

### Medical-Industry Trend Check
- n/a — internal change

### Acceptance Criteria
- [x] The questionnaire send dialog shows an "Email language" picker (en, pl, mx) when there is a recipient and documents.
- [x] The picker starts at the recipient's `identities.language` (`GET email-sends` returns it).
- [x] The Historia clínica sign dialog shows the same picker in the email purpose only.
- [x] A chosen language is sent as `body.language` and the mail is rendered in it; it is not written back to the identity.
- [x] No choice keeps today's behavior (patient language + region default).
- [x] An unsupported language is rejected with a validation error before anything is stored.

### Open Questions
- Other send sites (lead offer, partner invite, appointment mail) are out of scope for the first PR; follow-up ticket.

### Hand-off
→ `/dev feat sender-visible-email-language-picker` (done in this branch)
