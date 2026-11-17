## Refined User Story: Work board status and priority at a glance (CORE-225)

**Classification**: improvement (front end only; no table, route or permission changes)
**Raw input**: "Tablero de trabajo, status i urgencia: I need some more visual way of showing things here. Make a UX check and tell me what else can be fixed: a list of 15 things that will actually develop this Jira/Linear-like working log. I want to manage different projects, labels with colors, etc."

### As a platform admin, I want every status and priority on the work board to have its own mark and colour, so that I can read where a ticket stands without reading the words.

### Stakeholder Notes
- 👤 User: platform admins only. Today all nine statuses share one half-circle icon and the menus are plain text, so every value has to be read.
- 🏢 Client: no tenant-facing effect; the board is platform-internal.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: platform tooling shared by every team key. Nothing tenant-specific.
- ⚖️ Compliance: none. Colour is never the only signal (each status has its own shape), which keeps WCAG 1.4.1.

### Medical-Industry Trend Check
- n/a — internal tooling change.

### Decisions (proposal Artifact, 2026-11-16, form core-225-decisions)
- D1 Glyphs and priority bars everywhere: dialog chip and menu, column headings, cards, history, phone list. **This ticket.**
- D2 Full projects: colour, target date, progress, own page (new table). Own ticket.
- D3 Instant property save, undo after a move, live board, S / P / A / L shortcuts. Own ticket.
- D4 List view with grouping, bulk edit and saved views. Own ticket.
- D5 Sub-items and blockers, item types and templates, search and command palette, activity feed, insights and roadmap: Backlog tickets, grouped in a "Work board v2" project once D2 exists.

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] Each of the 9 statuses shows its own glyph on the dialog chip and in the status menu.
- [ ] The status menu is grouped Intake / Specification / Delivery / Closed and marks the current value.
- [ ] Each priority shows bars (Urgent an orange mark, none dashes) on the chip, in the menu and on the card.
- [ ] Column headings, cards, history lines and the phone list use the same glyphs.
- [ ] Every glyph that stands without text has an accessible name; a glyph next to its text is hidden from screen readers.
- [ ] New copy exists in `en.json`, `pl.json` and `mx.json`.

### Decided by default — test proves it
- Shape differs per status (dashed ring, filling pie, check, cross), so colour is never the only signal.
- Menu groups follow the board's column order; Canceled sits last under Closed.
- A card with no priority shows no priority mark (as today).
- An urgent card gets an orange leading edge.

### Open Questions
- none

### Hand-off
→ `/dev feat work-board-glyphs` — failing tests first
