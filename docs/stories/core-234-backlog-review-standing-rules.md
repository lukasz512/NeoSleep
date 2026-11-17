## Refined User Story: Backlog review and standing rules (CORE-234)

**Classification**: feature
**Raw input**: Decided by Łukasz in form board-upkeep-r1 (P3, variant "more"): review the Backlog once (close what shipped, sort the rest in rounds of five), then keep it honest with standing rules: a ticket nobody touched for 60 days is set aside as "later", a ticket enters Approved only with a priority and a Done when, and on Monday the session offers up to five picks when Approved runs low.

### As the platform owner, I want the Backlog to hold only tickets I still mean to do so that Approved is fed from a short, current list

### Stakeholder Notes
- 👤 User: Łukasz and the Claude Code sessions. Today the Backlog holds 111 tickets, 9 of them already on prod, 26 without a priority and 18 without a Done when; the nightly worker reads Approved, so an unprepared ticket there costs a night.
- 🏢 Client: no tenant-facing change.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: internal tooling (`platform.work_item`), every tenant's work goes through the same board.
- ⚖️ Compliance: no early flags; the board holds no tenant or patient data. One authorization change needs Łukasz's call: a session may apply his backlog-review answers (see Open Questions).

### Medical-Industry Trend Check
- n/a — internal change

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] The tidy run labels a Backlog ticket `later` when nothing touched it for 60 days, with an edit event and a comment; a ticket on `hold` or already `later` is left alone, and the label alone does not count as a touch.
- [ ] The tidy result lists those keys as `tidied.to_later`.
- [ ] The Backlog column shows tickets without `later` first and the `later` ones folded under a counted "Later" group.
- [ ] A move to Approved without a priority or without a Done when answers 400 naming the field, for every caller; the worker's give-back from Building is exempt. Creating a ticket straight in Approved follows the same rule.
- [ ] The board says why when a card dropped on Approved snaps back, and the ticket dialog says it on save.
- [ ] `POST /platform/work/backlog-review` applies `keep | later | cancel | shipped` to Backlog tickets only, in one transaction, each with a comment naming the form; `shipped` closes only a ticket git sees on prod; anything else is skipped with a reason; the agent gets 403.
- [ ] `pnpm board review --form <id> KEY=decision …` sends those answers; `pnpm board picks` lists Backlog tickets that are ready for Approved; `pnpm board picks --remind` prints one line only on a Monday with fewer than 3 tickets in Approved, and the session start shows it.

### Open Questions
- [ ] D1: may a session apply Łukasz's form answers to Backlog tickets (cancel, close shipped), or does he click them on the board himself?
- [ ] D2: may a session also move his Monday picks to Approved?

### Hand-off
→ `/dev feat backlog-review-standing-rules` — scope is clear; the two open questions ship as decisions in the Artifact.
