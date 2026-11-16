## Refined User Story: work board shows fewer columns and knows where the code is (CORE-221)

**Classification**: feature
**Raw input**: "Za dużo statusów, zróbmy sprzątanie." plus the history-tracking talk about NEO-133: a ticket
can sit in Needs Review while its code has been on prod for six weeks, or while nothing was ever merged,
and the board does not tell the two apart.

### As a platform admin, I want the board to show only the columns in use and each ticket's git state, so that I stop closing shipped tickets by hand and see at once which ones are stuck

### Stakeholder Notes
- 👤 User: Łukasz (platform admin, the only reviewer). Today he runs `git log origin/prod --grep=<KEY>` per
  ticket, or asks a session to, before he dares to close anything. 34 tickets wait in Needs Review.
- 🏢 Client: none directly; the board holds the platform's own tickets, not tenant data.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: internal tooling. It shortens the review queue, which is what delays prod promotions.
- ⚖️ Compliance: no personal data. One change of control: the agent token may now close a ticket, but only
  through the rule below (segregation of duties stays for every other close).

### Medical-Industry Trend Check
- n/a: internal change.

### Decisions (form board-statuses-r1, Łukasz, 2026-11-16)
- D1: the 9 statuses stay in the model. The board shows only non-empty columns; an empty one collapses to a
  narrow strip; Canceled sits behind a button. The nightly worker is untouched, no status migration.
- D2: a ticket leaves Needs Review for Done by itself only after a green prod smoke test, with a comment
  (commit + result). Tickets labeled `hold` stay until he closes them.
- D3: a git state marker (not merged / on dev / on prod) on the tile and in the ticket, plus one filter for
  "on prod but still in Review" and "in Review with nothing merged".
- D4 (NEO-133 documents + CI rule for missing ADRs) and D5 (artifact preview, CORE-222) are separate tickets.

### How the git state is known
The API runs on Cloud Run and has no git checkout. A GitHub Actions workflow (`board-git-state.yml`) reads
`git log` of `origin/dev` and `origin/prod`, finds the commits that cite a ticket key (subject, body or the
branch name in a merge commit, any letter case) and reports the result to `POST /platform/work/git-state`.
It runs on every push to dev and after every prod deploy; after a prod deploy it first checks the prod API
and PWA respond, and only then asks the API to close.

A ticket is `prod` only when the newest commit citing it on dev is on prod too, so a follow-up fix that is
still dev-only keeps the ticket at `dev` and it is not closed early. Until the API revision with this route
is serving, the report gets a 404 and the workflow only warns.

A commit that merely mentions another ticket ("see CORE-58") counts as citing it. Accepted: the same
heuristic was used by hand for the review queue, and a wrong "on prod" is corrected by the `hold` label.

### Acceptance Criteria (testable)
- [ ] An item with no commit citing its key on dev or prod has git state `none`; cited on dev only → `dev`;
      cited on prod → `prod`. Branch names in merge commits and lowercase keys count.
- [ ] `POST /platform/work/git-state` stores the state and newest citing commit per item; unknown keys are
      ignored; a tenant user gets 403; a session may report state but not close.
- [ ] With `close`, the API moves every item that is in Needs Review, reported `prod` and not labeled `hold`
      to Done, with a status event and a comment naming the commit and the smoke test run. Items labeled
      `hold`, items in other statuses and items not on prod stay.
- [ ] The board renders a full column only for statuses that hold at least one visible item; an empty status
      renders as a collapsed strip that still accepts a dropped card.
- [ ] Canceled items appear only after "Show canceled" is pressed.
- [ ] The tile and the dialog show the git state marker for items in Building and Needs Review, and for any
      other open item already on dev or prod.
- [ ] The "Out of step" filter shows only Needs Review items that are on prod or have nothing merged.
- [ ] A platform admin can put a ticket on hold and release it from the ticket dialog.
- [ ] CORE-25, CORE-26 and NEO-190 start on hold (open by Łukasz's decision in the 2026-11-16 review).

### Open Questions
- none

### Hand-off
→ `/dev feat core-221`
