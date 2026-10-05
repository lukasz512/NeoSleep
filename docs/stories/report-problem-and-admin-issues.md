# Report a problem + admin "Issues" view

Decision form `report-problem-r1` (2026-10-05). Ticket: pending (Linear not connected that day).

## Problem
Doctors (and every other user) have no in-app way to tell us something is wrong.
Production errors are already captured in `platform.diagnostics` (API 5xx via
`errorHandler`, frontend via `reportCaught`, NEO-81), but nobody can see them:
there is no view, every occurrence is a new row and API rows carry no tenant or user.

## User stories
- As a **doctor**, I tap "Feedback" in my user menu, pick Problem / Suggestion / Other,
  describe it, optionally attach a photo or file, and get a reference number back.
- As **any signed-in user** (rep, manager, admin), the same form is "Report a problem";
  every error screen offers "Report" with the failing request already attached (D2).
- As a **tenant admin**, I see my tenant's reports at /issues, move them
  new → in progress → resolved and leave a note (D4).
- As **Łukasz (platform admin)**, I also see the Errors tab: production errors grouped
  by kind, with count, last seen, stack and linked reports (D4), and I get an email for
  every new report and for the first occurrence of every new error kind on prod (D3).

## Decisions (form report-problem-r1)
| | Answer |
|---|---|
| D1 When | before the demo, on prod (built and verified on pwa-dev first; prod after Łukasz's OK) |
| D2 Who reports | everyone signed in + "Report" on every error screen |
| D3 Notifications | email per report + email on the first occurrence of a new error kind |
| D4 Who sees | tenant admin: own tenant's reports; errors: platform admins only |
| D5 Attachment | optional photo/file from the gallery |

Follow-up (separate, after the demo): automatic capture of all traffic for analysis
(events only — screen, action, timing, status, request_id; no form or request bodies,
pseudonymised user, 30-day retention, platform-admin only).

## Defaults (decided without asking — tests prove them)
- Description required, 10–5000 chars; max 5 reports per user per hour.
- Context attached automatically: page path (no query/fragment), app version, viewport,
  user agent, the last 10 errors of this session (scrubbed, with request_id).
- Same error = one row: grouped by (env, source, normalised message hash); count and
  last_seen bump; a resolved error that comes back reopens.
- API error rows carry tenant_slug + user_id.
- Attachment: one file, ≤ 5 MB, image/* or PDF, stored in the private bucket, admin opens
  it through a 5-minute signed URL.
- Report email carries number, kind, tenant, reporter role and page — not the description
  (it may contain patient data); the text stays behind the admin login.
- Non-admins get 403 on every /admin/* issues endpoint; tenant admin who is not a platform
  admin gets 403 on the errors endpoints.

## Data
Platform schema (cross-tenant by nature, like `diagnostics`), migration 053:
`platform.problem_report` (tenant_slug, number, kind, description, status, reporter,
context, attachment, admin_note) + dedup index on `platform.diagnostics`.
Platform admin = an active `platform.users` row with role owner/admin matching the
signed-in user's email.
