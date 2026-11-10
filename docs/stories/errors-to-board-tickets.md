## Refined User Story: App errors become board tickets, fixed by the nightly worker

**Classification**: feature (changes the error → email flow and feeds the autonomous worker, so scope and priority are open)
**Raw input**: "I want a better data flow: when errors appear in the app, tickets should be created automatically and we should fix them in the night sessions." (CORE-190)

### As the platform owner, I want every real app error to open (or update) one board ticket that the nightly worker picks up, so that bugs get fixed without me reading error emails

### Where we are today (2026-11-10)
- Errors land in `platform.diagnostics` and each new kind sends one "[NeoSleep production] New error" email (`services/issueNotifications.ts`).
- The env label comes from `NODE_ENV`, and `apps/api/Dockerfile:33` sets it to `production` on dev and prod. About 95% of "production" errors come from pwa-dev or localhost (3,787 hits vs 150 from pwa).
- Dedup by `message_hash` fails because browsers word the same bug differently. AuthOrbs has 1,385 rows for one bug.
- `useApi.ts` reports every non-2xx response, including 400 validation ("email is required").
- Nothing turns an error into a ticket. The nightly worker only takes `approved` tickets, one per run, and its schedule is off until the board pipeline (work-board-next step 3) is live.

### Stakeholder Notes
- 👤 User: reps and doctors stop hitting the same crash for weeks. Today the AuthOrbs crash has been live since 26.09.
- 🏢 Client: fewer visible failures, and a record of found → fixed for each error that can go into a tenant report.
- 🩺 Patient: indirect only. Crashes in patient or order screens delay care, so those rank first.
- 🚀 NeoCRM/Platform: generic for every tenant. Tickets go to team CORE, and tenant is a ticket field, not a separate flow.
- ⚖️ Compliance: error messages and stacks can carry patient names, emails or IDs. Ticket bodies are scrubbed, and the board is reachable by the agent token, so no raw PII reaches it.

### Medical-Industry Trend Check
- n/a — internal change

### Acceptance Criteria (testable)
- [ ] The env on each diagnostics row comes from `DEPLOY_ENV` (dev/prod), not `NODE_ENV`. A dev error is never labelled production.
- [ ] Fingerprint = normalized message (numbers, ids and quotes stripped, browser wording mapped to one form) + source + top app frame. The Firefox, Safari and Chrome variants of the AuthOrbs error produce one fingerprint.
- [ ] A 4xx validation response (400/401/403/404/409/422) never opens a ticket and never sends an email. 5xx and uncaught front-end errors do.
- [ ] The first occurrence of a fingerprint opens one CORE ticket with the label `auto-error`. The body (≤1500 chars) has the message, env, first and last seen, hit count, users affected (count only), top frames, and a link to the diagnostics row.
- [ ] Recurrences only update the counters on the same ticket, with no new ticket and no new comment per hit. A daily comment is added when the count changes.
- [ ] An error that comes back after its ticket was Done reopens that ticket and adds a "regressed" comment. No duplicate ticket is created.
- [ ] Ticket text is scrubbed of emails, phone numbers, UUIDs and query strings (names travel in URLs). A unit test feeds a stack containing an email and checks that it does not survive.
- [ ] A cap of at most N new auto-tickets per hour stops a broken deploy from flooding the board. Overflow is listed in one summary ticket.
- [ ] The nightly worker can take `auto-error` tickets, reproduce the error, fix it with a regression test, push a branch, and move the ticket to Needs Review. It never merges and never reaches Done.
- [ ] Integration tests run against real Postgres (rule 5): diagnostics insert → ticket created, recurrence → same ticket, validation 400 → nothing.

### Decisions (core190-r1, Łukasz 2026-11-10; all five = the recommended variant)
- D1: only prod errors that have a stack go straight to `approved`. Everything else goes to `triage`.
- D2: dev errors also open tickets, labelled `dev` with lower priority. Under D1 they wait in triage.
- D3: the night takes up to 3 `auto-error` tickets, the ones affecting the most distinct users first. Users are counted by hashed id, so no PII is stored.
- D4: per-error "New error" emails stop. Instead there is one morning digest (new errors + what the night fixed). Urgent prod 5xx are still emailed immediately.
- D5: the nightly worker is switched back on for `auto-error` tickets only. The full Spec/Build pipeline stays a separate ticket.

### Hand-off
→ `/arch assess errors-to-board-tickets`: fingerprint storage (a diagnostics column + a work_item link), scrubbing, and a hook on the board API
→ then `/dev feat` in this worktree
