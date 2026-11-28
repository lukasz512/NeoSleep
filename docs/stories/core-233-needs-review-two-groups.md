## Refined User Story: Needs Review shows what waits for you (CORE-233)

**Classification**: feature
**Raw input**: "Sprawdź w jaki sposób utrzymuję moją tablicę, na bank można by poprawić kilka rzeczy." Review of
2026-11-16: Needs Review held 39 tickets: 8 not merged, 19 on dev, 12 on prod, 7 with no artifact link. Form
board-upkeep-r1, P2, variant "more".

### As a platform admin, I want Needs Review to show first what waits for me, so that I review the oldest open work instead of scrolling past tickets that close by themselves

### Stakeholder Notes
- 👤 User: Łukasz (platform admin, the only reviewer). Today the tickets that need him are mixed with merged
  ones, so the column's count says nothing about his queue.
- 🏢 Client: none directly; the board holds the platform's own tickets, not tenant data.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: internal tooling. A short, honest review queue is what keeps sessions and the nightly
  worker from piling up unreviewed work.
- ⚖️ Compliance: no personal data. The reminder reads the board with the session token (read-only call).

### Medical-Industry Trend Check
- n/a: internal change.

### Decisions (form board-upkeep-r1, Łukasz, 2026-11-16)
- P2 (more): Needs Review in two groups, "Waiting for you" on top with a day counter and "Merged, closes by
  itself" folded below; a card with no artifact link is flagged; the session start reminds him when more than
  5 tickets older than 7 days wait.

### Decided by default (a test proves each)
- A merged ticket on hold (label `hold`) waits for a person, so it is in "Waiting for you".
- A ticket whose git state is unknown counts as waiting.
- "Waiting for you" is sorted by the longest wait first; the merged group keeps the column's order.
- The day counter is the card's existing days-in-column mark.
- The missing-artifact flag shows on every Needs Review card, merged or not.
- A ticket of exactly 7 days does not count towards the reminder; exactly 5 old tickets stay silent.

### Acceptance Criteria (testable)
- [ ] Needs Review renders "Waiting for you" with its count, then "Merged, closes by itself" with its count.
- [ ] A ticket is in the merged group when its git state is `dev` or `prod` and it has no `hold` label.
- [ ] The merged group is folded by default and unfolds and folds on click; it is absent when empty.
- [ ] "Waiting for you" lists the longest wait first, and each card shows the days it has waited.
- [ ] A Needs Review card with no artifact link shows "No artifact"; other statuses never show it.
- [ ] Every other status renders as one plain list, as before, in columns, phone tabs and the lane list.
- [ ] `pnpm board waiting` lists the waiting tickets with their days, the longest wait first.
- [ ] `pnpm board waiting --remind` prints one line naming the tickets when more than 5 have waited over
      7 days, and nothing otherwise; the session-start hook shows that line.

### Open Questions
- none

### Hand-off
→ `/dev feat core-233-needs-review-two-groups`
