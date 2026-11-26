## Refined User Story: One simple screen for errors, fixed by a Claude session that leaves an Artifact

**Classification**: feature (changes what the admin Issues screen shows and switches on unattended sessions, so scope, cost and priority are open)
**Raw input**: "The whole reports and problems section is not filled in. Why does the list of reported / auto-created errors not land there? It would be good if a Claude session were created there, the problem were solved, and the artifact waited for me ready to open. Everything should be graphical, simple to operate, this error handling." (CORE-227, Łukasz 2026-11-17, translated)

### As the platform owner, I want one visual screen that lists every reported and automatic error with its state, and a Claude session that picks an error up by itself and leaves an Artifact ready to open, so that I only review fixes instead of hunting for errors

Platform vs client: platform (every tenant; the screen and the worker are cross-tenant admin tools).

### Where we are today (measured 2026-11-16 23:15 UTC, shared DB, read-only)
- CORE-190 (PR #511) already made the API write `env` from `DEPLOY_ENV` (`dev` / `prod`), group by fingerprint and open `auto-error` board tickets. It reached the prod API only with the promote on 2026-11-16 22:35 UTC.
- The Errors tab asks for `env=prod` only (`apps/pwa/src/composables/useIssues.ts:72`). Until that promote no row had `env='prod'`, so the tab was empty for every status. 40 minutes after it, 5 prod groups exist.
- 3450 older groups carry the legacy label `production` (the story for CORE-190 measured about 95% of them as pwa-dev or localhost noise, grouped by the old weak hash). They match no filter and are invisible.
- Dev errors (29 groups) are recorded but never shown: the screen has no dev view.
- User reports: 2 rows in total (1 resolved, 1 dismissed). "New" is empty because nothing new was reported.
- The Errors tab does not show the board ticket, the branch or the Artifact of an error. The flow error → ticket → fix is invisible from the screen.
- The worker that fixes `auto-error` tickets (`.claude/skills/linear-worker`) is off: it needs `WORK_BOARD_AGENT_TOKEN_SHA256` on Cloud Run and its routine re-enabled.
- A status change on a user report leaves no `platform.audit` row (CORE-213 audits error-ticket status only).

### Stakeholder Notes
- 👤 User: the platform admin (Łukasz, later support). Today he reads error emails and an empty screen, and starts a session by hand for each bug. Reps and doctors benefit indirectly: crashes stop repeating for weeks.
- 🏢 Client: fewer visible failures and a found → fixed record per error that can go into a tenant report.
- 🩺 Patient: indirect only. Errors on patient, order and consent screens delay care, so they rank first (already the rule from CORE-190 D3: most users affected first).
- 🚀 NeoCRM/Platform: generic for every tenant. A self-healing loop with a human review step is a selling point for a small team; nothing here is NeoSleep-specific.
- ⚖️ Compliance: error text can carry patient names, emails or ids. Ticket bodies are already scrubbed (CORE-190); the same scrub must cover anything new shown on the screen or passed to a session. An unattended session never merges, never touches prod data, and keeps the compliance-sensitive scope block of linear-worker (migrations, auth, consent, identities). No new legal review needed unless that block is loosened.

### Medical-Industry Trend Check
- n/a — internal change

### Acceptance Criteria (testable)
Screen
- [ ] The Errors tab has a prod / dev switch (prod first). Each lists the groups of that env; a dev error is never shown under prod.
- [ ] Each error row shows one state chip from a fixed set: New → Ticket → Being fixed → Artifact ready → Done (plus Dismissed), derived from the diagnostics row and its linked work item, with no free text.
- [ ] A row with a ticket links to the board card; a row whose ticket has an Artifact link shows an "Open Artifact" button that opens it in a new tab; a row with a pushed branch shows the compare link.
- [ ] The header shows four counters (New, Being fixed, Artifact ready, Done this week); tapping one filters the list.
- [ ] Reports and Errors share the same row, chip and filter components, and a user report linked to an error (same request id) shows that error's state.
- [ ] Empty, loading and error states exist for each tab and each env; the empty state says what was checked ("No prod errors since <date>") instead of a blank panel.
- [ ] Works at phone width; all copy in i18n (en, pl, mx).
Data
- [ ] `GET /api/v1/admin/diagnostics` returns, per group, the linked work item (key, status, branch, artifact url) in one query; integration test on real Postgres.
- [ ] Legacy `production` rows are handled per decision D2 with a migration or a filter, never dropped.
- [ ] A status change on a user report writes a `platform.audit` row (`problem_report.status`, before → after, actor) in the same transaction; integration test.
Automation
- [ ] An eligible error (per D1/D3) gets a session without a manual step; the session moves the ticket to Building, pushes a branch, links its Artifact on the ticket and moves it to Needs Review. It never merges and never reaches Done.
- [ ] A blocked session leaves a `Blocked:` comment and the screen shows the row as "Needs you" with that reason.
- [ ] A daily cap on sessions (per D4) holds even when a deploy produces many new errors.
- [ ] Verified on pwa-dev as an admin: a provoked dev error appears on the screen, gets its ticket, and its state changes without a reload longer than the poll interval.

### Decided by default (a test proves each)
- State chip set and its mapping from ticket status: unit test on the mapping function.
- Dev tab exists, prod is the default tab: component test.
- "Open Artifact" appears only when the ticket has an artifact link: component test.
- Audit row for report status: integration test.
- Poll interval 60 s while the screen is open, no websockets: composable test.

### Decisions (core227-r1, Łukasz 2026-11-17; all five = the expanded variant)
- D1: sessions start at night in one batch, plus a "Fix now" button on an error row.
- D2: the 3450 legacy `production` groups get their own "Archive" filter, view only: no tickets, no sessions.
- D3: a prod error always qualifies; a dev error only when it repeats (2+ users or 5+ hits).
- D4: 3 automatic sessions a day; "Fix now" is counted separately, at most 5 manual a day.
- D5: three steps, each verified on pwa-dev on its own: (1) the screen, (2) the nightly worker, (3) "Fix now".

Steps 2 and 3 get their own tickets when step 1 is in review. The cap of 5 manual sessions starts with step 3.

### Open Questions
- none

### Hand-off
→ `/arch assess error-handling-one-screen`: how the API starts a session (routine trigger vs nightly schedule), the diagnostics ↔ work_item join, the agent token
→ `/ux` for the one-screen layout (state chips, counters, phone width)
→ then `/dev feat` in this worktree
