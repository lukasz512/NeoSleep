## Refined User Story: Email delivery log (invite history, resend throttle, status on all outgoing mail)

**Classification**: feature
**Raw input** (translated from Polish): After capacitation, "Activate" should open a modal with the list of already-sent requests and their status, ideally from our mail provider. Resend at most once per 5 minutes, or at least per 2. We need more info and control over what happens after the mail is sent. Statuses should sit next to mails sent to patients / doctors / users. Are there more such places in the app worth adding?

### As an admin or manager, I want to see every invite mail sent to a doctor with its delivery status, and be stopped from spamming resends, so that I know whether the doctor actually received the mail before I act again.

### Findings (verified in code)
- Delivery tracking already exists for patients only: `patient_email_send` (migration 040), Resend webhook -> `ApplyResendEventCommand` (`apps/api/src/commands/emailDelivery.ts`), status rank logic, `listPatientEmailSends`. Mails carry a `tenant` tag; mails without a row are ignored.
- Doctor invite: `POST /practitioner/:id/activate` (`routes/practitioner.ts`), button in `HCPDetailView.vue` (label switches to "Resend invite" once status is `invited`). It is also the resend action. No history, no cooldown, no status.
- Mails with NO tracking today: partner invite and join-thank-you (doctor), account created / password reset (user), lead offer, demo booking confirmation, document link, signed documents, problem report, device-order reconciliation alert.
- Already tracked (patients): questionnaire link, signed copy, appointment mails.

### Stakeholder Notes
- 👤 User: admin/manager; today they cannot tell whether a doctor's invite arrived, bounced or went to spam, and can click Activate repeatedly.
- 🏢 Client: a bounced invite is a silently lost HCP relationship; visible status lets the tenant act (fix address, call the doctor).
- 🩺 Patient: no direct effect; indirect via doctor onboarding.
- 🚀 NeoCRM/Platform: generic gap; one shared email log serves every tenant.
- ⚖️ Compliance: the log stores masked recipient + status only (as patient log does); no tracking pixels (opens/clicks stay ignored). Retention period to be confirmed.

### Medical-Industry Trend Check
n/a — internal change.

### Acceptance Criteria
- [ ] Clicking Activate/Resend on a doctor opens a modal listing previous invite sends (date, masked address, status, status detail, sent by) before anything is sent; sending is an explicit button in the modal.
- [ ] A resend within the cooldown (default 5 min, from config) is refused by the API with a 429-style error carrying the seconds left; the modal button is disabled with a countdown.
- [ ] Each send stores the provider message id; the Resend webhook moves its status (sent -> delivered / bounced / ...), never backwards.
- [ ] Status chips use the same component and wording as the patient email log.
- [ ] The doctor invite "set your password" mail and the thank-you mail both appear in the log, with their kind.
- [ ] Cooldown and tenant isolation covered by API integration tests on a real DB.

### Decisions (decision-form email-log-r1, answered 2026-11-26)
1. One `email_send` table with a polymorphic recipient (type + id); `patient_email_send` rows are copied in; one webhook, one UI status component.
2. Cooldown 5 min between invite sends plus max 5 sends per day, counted per recipient and mail type. Both limits return 429 with `retryAfter`.
3. Scope: doctor invite, thank-you, user account-created and password-reset mails. Lead offer, demo confirmation and documents go to a follow-up ticket on the finished table.

### Open Questions
none

### Hand-off
→ `/arch assess email-delivery-log` for the table decision, then `/dev feat`.
