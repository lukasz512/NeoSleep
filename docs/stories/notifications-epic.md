## Refined User Story: Notifications Epic

**Classification**: feature. This is a new cross-cutting capability that every role uses and that touches patient data and consent.
**Raw input**: "Notifications. I want a separate epic for this. Walk me through it: ask questions, draw artifacts, create the tasks in Linear. I also want good documentation for it. Let's do it with the intention of a really good medical app." (Łukasz, 2026-09-26)

**Linear**: Project [Notifications](https://linear.app/neosleep/project/notifications-a8128ec089ba) (P-NEO-3), label `Notifications`, NEO-133…150. Consent management was split out to [Consents & Privacy](https://linear.app/neosleep/project/consents-and-privacy-1ac69cbde303) (P-NEO-4).
**Decisions**: decision form [round 1](https://claude.ai/artifact/4eV6rH7VrcvryVAgB5mTwx) (20 questions) and [round 2](https://claude.ai/artifact/F1wEgYY4srGcFVJM2W4XMt) (10 questions), both answered 2026-09-27.
**Architecture**: [ADR-027](../ADR-027-notification-engine.md), which extends [ADR-012](../ADR-012-notification-center.md).

### As a doctor, manager, rep or patient, I want to be told about what needs me, at the right time, on a channel I chose, without my health data showing up on a lock screen or in an inbox, so that nothing clinically or commercially important slips and I don't learn to ignore the app.

### Starting point (verified in code on 2026-09-26)
- **In-app inbox exists** (ADR-012): `notification` + `notification_delivery`, GET/PATCH routes, and polling every 45 s. The bell renders only on `DashboardView`, and since #244 the Dashboard is admin-only. **Doctors and managers never see a notification today.**
- **Two producers**: the OrthoApnea status sync and appointment book/reschedule/cancel (NEO-27). Both write ad-hoc text straight into `notification`.
- **Web push is half-built**:
  - `routes/push.ts` has no `requireAuth` and no `withTenant`;
  - the service worker (VitePWA generateSW) has no `push` / `notificationclick` handler;
  - the app never asks for permission;
  - nothing calls `sendPushToUser`.
- **Nothing is ever written** to `notification_delivery`, and `app_config.notification_defaults` is never read.
- **Email**: Resend sends 7 system emails. None is linked to notifications.
- **No scheduler** (the only cron jobs are keep-warm and the backup). There is no SMS or WhatsApp code.
- `docs/features.md` called Web Push "Complete" and in-app "Missing". Both were wrong, and NEO-133 corrects them.

### Stakeholder Notes
- 👤 **User**:
  - Doctors are the main recipients (appointments, results, patient forms, orders).
  - Managers need region signals and a morning summary.
  - Reps need lead and territory signals.
  - Today all of them work around the missing notifications by re-opening lists. Alert fatigue is the main design risk (see the trend check below), so preferences, grouping and a digest are core scope, not polish.
- 🏢 **Client**: Tenants get fewer missed appointments and faster turnaround on results and orders. Admins set channel defaults for their organisation. There are no per-tenant templates in v1, which keeps white-label maintenance low.
- 🩺 **Patient**:
  - Direct effect: appointment reminders reduce no-shows and protect care continuity.
  - Indirect effect: doctors react faster to new results and forms.
  - Main risk: health data leaking through lock screens and email inboxes. This is mitigated by the no-PHI-outside-the-app rule.
- 🚀 **NeoCRM / Platform**: One generic engine (event catalog + channels + preferences) serves every tenant and market (PL, MX, later TH). It is also the base for the future doctor and patient portals: the inbox is keyed to `identities`, not `users` (ADR-012).
- ⚖️ **Compliance**:
  - PHI minimisation on every channel outside the app.
  - Per-channel patient consent (email, SMS and WhatsApp as separate checkboxes).
  - Locked security and legal categories (ADR-012 table).
  - Retention: read items 90 days, unread 180 days, delivery log 1 year.
  - Automatic clinical triage is out of scope, because it would make the app SaMD (MDR IIa).
  - /legal must sign off the consent wording (NEO-146) and the manual urgent flag (NEO-150).

### Medical-Industry Trend Check
- Alert fatigue was the most-cited burnout factor in the 2025 AMA Physician Work Environment Report. Hospital physicians get more than 180 EHR alerts a day, and override rates for low-priority alerts are above 95%. Source: [Clinician Core, Alert Fatigue 2026](https://cliniciancore.com/blog-articles/alert-fatigue-in-healthcare/).
- A VHA study (6,459 PCPs, 138 facilities) found that cutting inbox volume alone did not reduce burnout. What helps is letting clinicians shape and customise their alerts. Source: [EHR Intelligence](https://ehrintelligence.com/news/reduction-in-ehr-inbox-notifications-not-enough-to-cut-clinician-burnout). This is why the epic uses a preferences matrix plus a digest rather than just "fewer messages".
- Browsers (Safari, Firefox) block permission prompts shown on load. A contextual soft prompt after a meaningful action gives far healthier opt-in. Source: [Pushpad, double opt-in](https://pushpad.xyz/blog/the-double-opt-in-for-web-push-notifications).
- Reminders cut appointment no-shows by 30–50%. See [the calendar epic's check](calendar-scheduling-epic.md#medical-industry-trend-check).

### Decisions (r1 + r2, 2026-09-27)

| # | Topic | Decision |
|---|---|---|
| r1 A1 | Recipients | Doctor, manager/admin, rep/KAM/MSL, patient (patients have no login: email only) |
| r1 A2 | Events v1 | Appointments; reminders; patient form/signature; new result or patient; OrthoApnea orders; account security |
| r1 A3 + r2 R1 | Clinical priority | **Operational only** in v1. A `priority` field exists from day 1. A manual "urgent" flag set by a person comes later (NEO-150). Automatic thresholds need an MDR assessment first |
| r1 B1 | Staff channels | In-app, push, email, WhatsApp (WhatsApp last, NEO-149) |
| r1 B2 | Patient channels | Email in v1; SMS later (NEO-148) |
| r1 B3 + r2 R4 | Escalation | Important notification unread in-app for **30 min** → email |
| r1 B4 + r2 R5 | Digest | Morning "Your day" at **07:00 Mon–Fri**, time editable, **sent only when non-empty** |
| r1 C1 | Lock screen | Generic text only ("New sleep study result — open NeoSleep") |
| r1 C2 | Email body | No patient data; event type + button |
| r1 C3 + r2 R2 | Patient consent | Per-channel consent in the QR consent; **WhatsApp is a separate checkbox** |
| r2 R3 | Consent management | Separate epic, Consents & Privacy (P-NEO-4) |
| r1 D1 | Preferences | Category × channel matrix; security/legal locked |
| r1 D2 | Quiet hours | 21:00–07:00 default, editable, user time zone; locked categories bypass them |
| r1 D3 | Tenant settings | Admin sets default channels per category; no custom templates in v1 |
| r1 E1 | Bell | Global top bar on every screen (desktop + phone) |
| r1 E2 | Actions | Deep link, push actions, grouping, app-icon badge |
| r2 R7 | Grouping | 5 min window for push/email; the inbox is always grouped per record |
| r1 E3 | Push permission | Contextual, after a meaningful action; never on load |
| r1 E4 | Retention | Read 90 days, unread 180 days, delivery log 1 year |
| r2 R6 | Patient reminders | 24 h + 2 h before; the 2 h reminder only between 08:00 and 20:00 clinic time |
| r2 R8 | Manager/admin events | Region forms, order problems, cancellations, lead unassigned over 24 h — **real time and in the digest** (confirmed 2026-09-28: "a manager should get a lot of information") |
| r2 R9 | Rep events | Lead assigned, lead neglected, doctor activity in territory, planner reminder |
| r1 F1 | Build order | **Engine first**, then channels and UI, events, patient, later |
| r1 F2 | Scheduler | Google Cloud Scheduler → internal job endpoint every 5 min |
| r2 R10 | WhatsApp/SMS provider | Decided at NEO-149 |
| r1 F3 | Docs | Artifact + repo (this file, ADR-027) + Linear project |

### Tickets

| Stage | Ticket | Scope |
|---|---|---|
| 1 · Engine | NEO-133 | This story, ADR-027, visual overview |
| | NEO-134 | Event catalog, `notify()`, delivery log, grouping, `priority` |
| | NEO-135 | Preferences model, locks, quiet hours, tenant defaults |
| | NEO-136 | Cloud Scheduler tick, delivery worker, escalation, retention |
| 2 · Channels & UI | NEO-137 | Global bell + inbox, deep links, badge |
| | NEO-138 | Web push end to end |
| | NEO-139 | Email channel (PHI-free template, escalation) |
| | NEO-140 | Preferences screen |
| 3 · Events | NEO-141 | Doctor events |
| | NEO-142 | Manager/admin events |
| | NEO-143 | Rep/KAM/MSL events |
| | NEO-144 | Security events |
| | NEO-145 | Morning digest |
| 4 · Patient | NEO-146 | Per-channel contact consent in the QR consent |
| | NEO-147 | Appointment reminders by email (24 h + 2 h) |
| 5 · Later | NEO-148 | SMS for patients (go/no-go after measuring no-shows) |
| | NEO-149 | WhatsApp for staff (provider + cost decision first) |
| | NEO-150 | Manual urgent flag (legal/certification check) |

Overlap with the Calendar epic: NEO-141 covers the in-app part of NEO-28, and NEO-147 is the reminder half. NEO-28 keeps only the booking confirmation email and the `.ics` (NEO-29).

### Acceptance Criteria (epic level; each ticket has its own)
- [ ] Every role sees the bell on every screen, and a click opens the record.
- [ ] One `notify()` call produces one inbox item and one delivery row per channel. Nothing is duplicated across channels.
- [ ] No patient name, diagnosis or clinical value appears in any push, email or SMS payload (catalog-level test).
- [ ] Users can turn channels off per category. Security and legal cannot be turned off.
- [ ] Quiet hours defer push and email. Locked categories bypass them.
- [ ] Unread important items escalate to email after 30 min, exactly once.
- [ ] The morning digest arrives at local 07:00 on weekdays only, and never empty.
- [ ] Patients receive reminders only with recorded consent for that channel. Skipped sends are logged.
- [ ] The retention jobs purge on schedule, and the delivery log keeps 1 year.
- [ ] All copy starts in `packages/i18n/en.json`, with pl/mx parity.

### Open Questions
1. ~~R8 contradiction~~ — resolved 2026-09-28: real time **and** digest.
2. The WhatsApp/SMS provider (Twilio vs Meta + SMSAPI) is deferred to NEO-149. Cost per message and the DPA must be known before the go decision.
3. /legal must review the per-channel consent wording in PL and MX (NEO-146) before it ships.
4. Cloud Scheduler for **prod**: prod still runs on Render (NEO-45). The tick endpoint must work on both platforms, and the Scheduler targets whichever one serves prod at the time.

### Hand-off
Next is `/arch` for ADR-027 (done in NEO-133). Implementation starts at NEO-134.
