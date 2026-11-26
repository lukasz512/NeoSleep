## Refined User Story: Building means a branch exists (CORE-223)

**Classification**: feature
**Raw input**: "Sprawdź w jaki sposób utrzymuję moją tablicę, na bank można by poprawić kilka rzeczy." Review of
2026-11-16: 23 tickets in Building, 16 of them with no branch and no worktree, 13 created the same day as side
tickets of other sessions, 3 already on dev. Form board-upkeep-r1, P1, variant "more".

### As a platform admin, I want Building to hold only tickets somebody is building, so that the column tells me what is in progress without checking git

### Stakeholder Notes
- 👤 User: Łukasz (platform admin, the only reviewer). Today he cannot tell work in progress from ideas a
  session wrote down for later, because both land in Building.
- 🏢 Client: none directly; the board holds the platform's own tickets, not tenant data.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: internal tooling. An honest Building column is what the nightly worker and the weekly
  pick (P3) are planned on.
- ⚖️ Compliance: no personal data. The agent token gains two rule-bound status moves (Building → Backlog,
  Building → Needs Review); each leaves a status event and a comment, like the automatic close of CORE-221.

### Medical-Industry Trend Check
- n/a: internal change.

### Decisions (form board-upkeep-r1, Łukasz, 2026-11-16)
- P1 (more): a session's side ticket goes to Backlog (`pnpm board create --later`). An automatic tidy returns a
  Building ticket with no branch for 3 days to Backlog and moves a Building ticket that git sees on dev to
  Needs Review. The tickets that are stale today are tidied by the first run.
- P2 (Needs Review in two groups + reminder) and P3 (Backlog review + standing rules) are separate tickets.

### How the tidy knows
The tidy rides on the git-state report of CORE-221 (`board-git-state.yml`): GitHub Actions has the checkout,
the API does not. The report now also lists the ticket keys that have a remote branch. A ticket "has a
branch" when the board's `branch` field is set (`pnpm board branch`) or a remote branch name cites its key.
The workflow also runs once a day, so the 3-day rule fires on days without a push to dev.

A worktree that was never pushed and never registered with `pnpm board branch` is invisible to the tidy.
Accepted: the workflow rules already require `pnpm board branch` right after the worktree is created.

### Acceptance Criteria (testable)
- [ ] A session that creates a ticket with `status: "backlog"` gets a Backlog ticket with the `session` label;
      without it the ticket starts in Building as before. Any other status from a session still means Building.
- [ ] `pnpm board create --later` sends `status: "backlog"` and does not print the /rename hint.
- [ ] With `tidy`, a Building ticket whose git state is `dev` or `prod` moves to Needs Review, with a status
      event and a comment that names the commit.
- [ ] With `tidy`, a Building ticket with no `branch`, no reported remote branch, git state `none` and more
      than 3 days in Building moves to Backlog, with a status event and a comment that says why.
- [ ] A Building ticket younger than 3 days, or with a `branch`, or with a reported remote branch, stays.
- [ ] Tickets labeled `hold` are never tidied.
- [ ] A ticket a person sent back from Needs Review to Building (rework) is not bounced to Needs Review again
      by the same merged commit.
- [ ] A session token cannot send `tidy` (403); the agent token and a platform admin can.
- [ ] `board-git-state.mjs` reports the keys cited by remote branch names, without `dev` and `prod`.

### Open Questions
- none

### Hand-off
→ `/dev feat core-223-board-building-needs-branch`
