## Refined User Story: Post-landing verify stage for the nightly worker

**Classification**: feature (platform, work board + CI)
**Ticket**: CORE-277
**Hoisting**: platform (every tenant's board gets it)

**Raw input**: "przy nocnym workerze - jak merguje task - to powinienem miec mozliwosc odbicia go na jakis status gdzie beda wykonane testy i on wroci do review ale po testach - albo do zamkniecia, albo do naprawy. i to bedzie oznaczone. ... potrzebuje testy i artefakt zeby byly czescia mojej jiry."

Decisions by Łukasz (decision form core277-r1, all "more"):
- D1 New status `verifying` plus `verify_state` (pending / pass / fail), like `git_state`.
- D2 Tests start automatically once the code is on dev (`git_state = dev`): full tests plus pwa-dev smoke with the QA account. A re-run button re-triggers them.
- D3 On red the original stays in Needs Review with a fail mark; a linked fix ticket lands in Approved for the worker.
- D4 The card shows an AC → test map with ✔/✘.
- D5 The API refuses a move to Needs Review without an artifact link and a test-run (`ci`) link. New moves only.

The worker never merges (Łukasz opens the PR), so "after merge" means `git_state = dev`.

### As the product owner, I want a landed worker ticket to be verified automatically and return to review marked "ready to close" or "needs a fix", so that I close or reject it from evidence on the card instead of re-testing by hand.

### Acceptance Criteria
- [ ] `verifying` is a board status; `verify_state` is one of pending / pass / fail / empty.
- [ ] A Needs Review ticket that reaches `git_state = dev` (no `hold` label, never verified) moves to `verifying` with `verify_state = pending`.
- [ ] A human or session can re-run verification of a Needs Review / Verifying ticket; the agent cannot.
- [ ] The verify result endpoint returns the ticket to Needs Review, stores state, run URL and AC → test results, and records a `ci` link with its state.
- [ ] A failed result creates one linked fix ticket in Approved; repeating the result does not create a second.
- [ ] A ticket with `verify_state = fail` is never auto-closed when it reaches prod.
- [ ] The agent cannot move a ticket to Done, nor out of Verifying.
- [ ] Moving to Needs Review as agent or session requires an `artifact` link and a `ci` link.
- [ ] The card shows a verify badge (pass / fail, time, run link); no badge when never verified.
- [ ] The dialog shows the AC → test map, the links and a re-run button.
- [ ] A GitHub workflow runs pending verifications and posts the result.

### Stakeholder Notes
- 👤 User: one place to see tests and artifact per ticket.
- 🏢 Client: none visible; internal tooling.
- 🩺 Patient: indirect; fewer regressions reach clinics.
- 🚀 Platform: board gains a verification stage reusable by every tenant.
- ⚖️ Compliance: n/a.

### Medical-Industry Trend Check
n/a — internal tooling.
