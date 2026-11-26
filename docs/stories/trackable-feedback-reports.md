## Refined User Story: Trackable feedback and problem reports

**Classification**: feature (new capability: report lifecycle, notifications, tracker link)
**Raw input** (Łukasz, 2026-10-05): "When someone sends me feedback they should get an email notification, and if it was a bug, show somewhere the ticket it was filed under. I tested it as a doctor and got no email, and the doctor has nothing in notifications showing they sent it. The mail vanished; that can't be. It's untrackable. Let's fix it."

**State before CORE-141 (verified 2026-10-05 morning)**: the only reporting path was a `mailto:` "Report incident" CTA in `ResourcesView.vue` (partner resources error state) to `SUPPORT_EMAIL` (`apps/pwa/src/config/support.ts`). The app opens the device mail client; if the user doesn't press Send, or the device has no mail account, nothing leaves. Nothing was stored server-side, the reporter got no confirmation and no ticket existed.

### As any signed-in user (doctor, rep, manager, admin), I want to send a problem report or feedback from inside the app and see that it arrived and what happened to it, so that nothing I report gets lost and I know whether it was fixed.

### Stakeholder Notes
- 👤 User: doctors are the most important reporters right now and won't chase a lost email; a confirmation plus a visible status builds trust in a young product.
- 🏢 Client: tenant admins get a record of the issues their staff reported; reports belong to the tenant (stored in the tenant schema).
- 🩺 Patient: indirect. A lost bug report about a clinical screen can delay a fix that affects care. Reports must not carry PHI by default (warning copy, no automatic patient data).
- 🚀 NeoCRM/Platform: generic for every tenant (CORE), reuses the notification engine (`notify()` + catalog) and `@neo/email`. The tracker link is a plain reference field, so it works with Linear today and the planned own kanban later.
- ⚖️ Compliance: free text may contain patient data despite the warning. It is stored in the tenant schema, never sent to Linear automatically; the email to the admin inbox carries only the reference + category, not the body. → /legal light check before go-live.

### Medical-Industry Trend Check
- n/a — internal support tooling.

### Acceptance Criteria
- [ ] A "Report a problem / feedback" action is reachable from the account menu on every screen and from the error states that already have "Report incident"; the `mailto:` is removed.
- [ ] Submitting creates a stored report (`pending`) with a human reference (e.g. `R-0042`), category (bug / idea / question), free text, and auto-captured context: route, app version, browser/OS, user, tenant, timestamp, last error reference if any. No patient data is captured automatically.
- [ ] The reporter immediately gets (a) an in-app notification "Report R-0042 received" and (b) an email confirmation with the reference, in their locale.
- [ ] Admins get an in-app notification and `RESEND_NOTIFY_TO` gets an email with reference, category, reporter and a link, without the free text.
- [ ] The reporter can see their reports and statuses ("My reports"), including the linked ticket ID (e.g. CORE-123) once an admin attaches one.
- [ ] When an admin changes status to resolved / won't fix, the reporter gets in-app + email with the ticket ID and a short note.
- [ ] If the submit request fails (offline), the report is kept as a draft and retried; the user is told it is not sent yet. It never silently disappears.
- [ ] Reports are tenant-scoped: a user only sees their own; admins see their tenant's reports.

### Decisions (feedback-r1, Łukasz 2026-10-05, https://claude.ai/artifact/5VK9tNpiuNjzYQYcsez37H)
- D1: "Report a problem / feedback" in the account menu for all roles, AND every error state opens the same dialog prefilled with category "bug" + the error reference.
- D2: ticket ID is a plain field the admin fills in manually (e.g. CORE-123). No Linear API integration.
- D3: reporter gets an email only on resolved / won't fix, with a short note from the admin about what changed (note must be PHI-free). Intermediate status changes are in-app only.
- D4: no screenshot in v1. Later item: screenshot with automatic patient-data redaction + legal review.
- Defaults from the form ("decided without asking") stand as acceptance criteria above.

### Ticket (to create when Linear is reconnected; team CORE)
Title: Trackable problem reports instead of mailto
## Problem
"Report incident" is a mailto: to neosleepcare@gmail.com. A doctor's test report never arrived and left no trace in the app: nothing stored, no confirmation, no ticket.
## Change
Stored support_ticket (R-xxxx) from account menu + every error state; reporter gets in-app + email confirmation; admins notified (email without body); "My reports" with status + manual ticket ID; resolved/won't-fix email with admin note.
## Done when
A doctor's report on pwa-dev shows in their notifications + inbox with R-number, reaches Łukasz, and the resolution email carries the CORE-n.

### Built (2026-10-05, on top of CORE-141)
CORE-141 (`docs/stories/report-problem-and-admin-issues.md`, PR #438) already shipped the stored report (`platform.problem_report`, `#number`), the Feedback dialog in the account menu and on every error state, the metadata-only email to `RESEND_NOTIFY_TO` and the admin Issues view. This story adds the reporter side:

| Criterion | Where |
|---|---|
| Reporter gets in-app + email receipt with the number | `services/problemReportNotifications.ts` (`problem_report_received`), `mailer.ts` `buildProblemReportEmail` |
| Admins get an in-app heads-up | `problem_report_new` → `/issues?report=<id>` (tenant admins only) |
| "My reports" with status, ticket, reply | `GET /api/v1/problem-reports/mine`, `views/MyReportsView.vue` (`/my-reports`, account menu under Feedback) |
| Ticket ID is a manual field (D2) | migration `054_problem_report_tracking.sql` `tracker_ref`, admin dialog field, key format `ABC-123` |
| Resolved / won't fix → in-app + email with ticket and reply (D3) | `problem_report_closed`; `in_progress` is in-app only. The reply is a separate `reporter_reply` field; the existing `admin_note` stays internal |
| Unsent report never vanishes | `useReportProblem.ts` draft per tenant+user on the device (text + kind, 7 days), restored on next open, cleared on send |
| `mailto:` removed | Resources error state now opens the same dialog; `config/support.ts` deleted |

Deviations: the reference is `#42` (CORE-141's existing format), not `R-0042`. Reports live in `platform.problem_report` scoped by `tenant_slug` (CORE-141's choice), not a tenant-schema `support_ticket` table. No automatic retry on reconnect: the restored draft is sent when the user taps Send.

Tests: `apps/api/src/routes/problemReportTracking.spec.ts`, `apps/api/src/mailer.problemReport.spec.ts`, `apps/pwa/src/views/MyReportsView.spec.ts`, `apps/pwa/src/components/issues/ReportDetailDialog.spec.ts`, draft cases in `ReportProblemDialog.spec.ts`, menu row in `AppUserMenuPanel.spec.ts`.
