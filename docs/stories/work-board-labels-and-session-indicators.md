## Refined User Story: Work board labels and session indicators (CORE-219)

**Classification**: feature (new capability on the board, a new table, and a changed toolbar; Łukasz picked the variants in the proposal Artifact)
**Raw input**: "Work board: what can be improved there? I would like to add labels and sort by them. Also Claude sessions and tokens: I would like to show those icons better. Show me proposals in an artifact."

### As a platform admin, I want to label work items, filter and group the board by label, and see at a glance which items a Claude session created or is working on, so that I can read the board by topic instead of scanning titles.

### Stakeholder Notes
- 👤 User: platform admins only (Łukasz and neoCRM staff). Today labels exist in the data but are invisible, so topic grouping happens in his head or in titles.
- 🏢 Client: no tenant-facing effect; the board is platform-internal. Indirect benefit: client teams (NEO, AJM) get clearer tracking of their work.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: platform tooling, shared by every team key. Nothing tenant-specific.
- ⚖️ Compliance: no early flags. Labels are free text typed by admins; no patient or HCP data belongs in them.

### Medical-Industry Trend Check
- n/a — internal tooling change.

### Decisions (proposal Artifact, 2026-11-16)
- D1 Sort by label = horizontal swimlanes: one label is one board row, status columns stay.
- D2 Labels come from a catalog with their own colour and can be renamed (new table + migration).
- D3 "Claude sessions" becomes the first chip in the filter row; session tokens move under a key icon with the active count; a live green dot marks an item a session touched in the last 15 minutes, and a token used in the last 15 minutes.
- D4 Card extras: assignee, due date, days in column, link icons with CI status, plus a density switch (compact / full).

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] A label catalog exists per platform (name unique case-insensitively, colour from a fixed palette). The migration fills it from the labels already on items.
- [ ] In the item dialog an admin can add an existing label, create a new one by typing, and remove one. More than 10 labels on an item is rejected.
- [ ] Renaming a label in the catalog changes it on every item that carries it, in one transaction. Renaming to an existing name is rejected with a validation error.
- [ ] Changing a label's colour changes its chip everywhere after reload.
- [ ] A card shows its labels as coloured chips (at most 3, then "+n"). The technical `session` label is never shown as a chip.
- [ ] The filter row lists "Claude sessions" first with its count, then every catalog label. Selecting labels narrows the board to items that carry all selected labels. Clicking a chip on a card toggles the same filter.
- [ ] Sort has two modes: Priority (current order) and Label. Label mode renders one swimlane per label with the status columns inside it; an item with several labels sits in the lane of its first label by catalog name; items without a label sit in a last "No label" lane; empty lanes are not rendered.
- [ ] Dragging a card between columns inside a lane changes its status exactly as today. Dragging never changes labels.
- [ ] On phones Label mode groups the list by label, then by status.
- [ ] Team, selected labels, sessions filter and sort mode are kept in the URL query and restored on reload.
- [ ] A card created by a session shows a session badge. It shows the live dot when a session-authored event on that item is younger than 15 minutes, and not otherwise.
- [ ] The toolbar shows a key icon button with the number of non-revoked tokens; it opens the existing tokens dialog. A token row shows the live dot when `last_used_at` is younger than 15 minutes.
- [ ] A card's footer shows the assignee's initials, the due date (red when past and the item is not done) and "n days in column" from `status_changed_at` (amber after 3 days in Needs Review, after 7 in Building).
- [ ] Card links are icons with accessible names instead of text; the CI icon is green, red or neutral by the CI link's recorded state.
- [ ] A density switch (compact / full) hides or shows the card footer and label row; the choice is remembered per browser.
- [ ] A swimlane can be collapsed to its header (label, count); the collapsed state is remembered per browser.
- [ ] Session tokens (the `pnpm board` CLI) can still create, comment, link and move items; label catalog writes need a platform admin.
- [ ] All new copy exists in `en.json`, `pl.json` and `mx.json`.

### Round 2 (decision form core-219-r2, 2026-11-17): the top of the board and the phone

Decisions, all in the expanded variant:
- D1 One toolbar row (team, search, Filters, New item); the rest moves into a View menu that counts what is switched on.
- D2 No permanent row of every label: "Claude sessions" stays on top with its count, labels are picked under Filters and show only as removable chips.
- D3 Phone: sticky status tabs with counts, one status per screen, a sideways swipe moves to the next status.
- D4 Phone: search and a Filters button that opens a bottom sheet; "New item" floats bottom-right.
- D5 Phone: compact cards by default; label lanes start folded.

Acceptance criteria (they replace the filter-row, key-button and density-switch criteria above where they differ):
- [ ] On desktop the top is one row: team, search, Claude sessions with its count, Filters, View, New item. No catalog label is listed until it is picked.
- [ ] Filters lists the catalog labels; a picked label shows as a chip under the row, a click on the chip removes it, Clear removes all of them.
- [ ] View holds Out of step, Show canceled, the sort, Compact cards, Edit labels, Session tokens (with the active count) and the shortcut hint. Its button reads "View · n" while n of Out of step, Show canceled and sort by label are on.
- [ ] On a phone the board shows one status at a time under a sticky tab bar with a count per tab; a status with no tickets has no tab.
- [ ] A swipe left or right on the phone list moves to the next or previous tab; a mostly vertical move does not. Coming back to a tab restores how far it was scrolled.
- [ ] On a phone the top is search, Claude sessions and a Filters button; the button opens a bottom sheet with team, labels and the View options, and counts the team, label and View filters that are on.
- [ ] On a phone "New item" is a floating button bottom-right, above the bottom navigation.
- [ ] A compact card shows the key, the title and one row: a dot per label, where the code is, on hold, days in the column, and the link icons (CI with its state).
- [ ] On a phone cards are compact until switched off there (remembered apart from the desktop choice), and label lanes start folded.

### Decided by default — test proves it
- A tab that was not visited yet opens at the top.
- A filter that empties the open tab moves the board to the first tab that still has tickets.
- Lanes unfolded on a phone are not remembered between visits.
- Label names: trimmed, 1–40 characters, compared case-insensitively.
- A new label gets the next palette colour not yet used, wrapping around.
- Deleting a catalog label is out of scope for this ticket (rename and recolour only).
- Lane order: alphabetical by label name, "No label" last.

### Open Questions
- none

### Hand-off
→ `/arch assess work-board-label-catalog` — new platform table and how items reference labels (keep `labels TEXT[]` and rename by name, or a join table)
→ `/dev feat work-board-labels` — after the plan is approved
