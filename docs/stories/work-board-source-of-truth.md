## Refined User Story: Work board becomes the one source of truth for Claude sessions (CORE-187)

**Classification**: feature (changes the daily workflow of every Claude session and retires Linear writes)
**Raw input**: "zaczynamy od work-board-next", step 1 of `.claude/local/handoff/work-board-next.md`: Claude sessions create/move tickets on the board, not Linear (D2); session token; ticket-teams, ticket-format hook, ship-artifact, worktree-clean read the board API; final Linear import, then Linear read-only.

### As Łukasz (platform owner), I want every Claude session to create, comment on and hand over its ticket on the work board so that the board is complete from day one and Linear (250-issue cap) stops being needed.

### Stakeholder Notes
- 👤 User: Łukasz only; today he reads tickets in Linear and the board in parallel, and the board goes stale with every new session.
- 🏢 Client: no direct effect; client teams (NEO, AJM) stay data on the board, ready for per-client views later.
- 🩺 Patient: no downstream patient effect (internal tooling, no clinical data on the board).
- 🚀 NeoCRM/Platform: removes a capped external dependency; the same API later feeds the nightly pipeline (step 3) and tester reports (CORE-158).
- ⚖️ Compliance: a new long-lived credential on a developer machine that writes production data (platform schema). Stored only in `.claude/local/` (gitignored), compared by SHA-256 like the agent token, revocable. No personal/health data involved.

### Medical-Industry Trend Check
- n/a — internal change.

### Design sketch (for Plan mode)
- API: third actor kind `session` (`X-Session-Token`, `WORK_BOARD_SESSION_TOKEN_SHA256`): create items (not in Done/Triage), comment, `add_links`, `branch`, status moves up to Needs Review. Never Done/Canceled, never delete.
- CLI `scripts/board.mjs` (create · get · comment · link · move · list) replaces the Linear MCP calls in hooks and skills; base URL + token from `.claude/local/board.json`.
- Hooks: the ticket-format check moves from the `mcp__claude_ai_Linear__save_issue` matcher to the CLI (`board.mjs create` validates the same template; the hook keeps it un-bypassable); a PreToolUse deny on Linear `save_issue`/`save_comment` after the cut-over.
- ship-artifact: Linear button → board link `/platform/board/<KEY>-<n>` (deep link that opens the card); marker fields `linearUrl/linearAttached/linearCommented` → `boardUrl/boardLinked/boardCommented` (quality-gate reads both during the transition).
- `.claude/ticket-teams` stays as an offline fallback, generated from the board's teams.
- Final import: Linear issues created after 2026-10-07 via a new numbered migration (061, same shape as 060), then Linear read-only.

### Acceptance Criteria
- [ ] Session token: create in Backlog/In Progress → 201; create in Done → 403; move In Progress → Needs Review → 200; move to Done → 403; wrong token → 401 (integration tests, real DB).
- [ ] The session actor is recorded in the item's event history (`kind = session`).
- [ ] `board.mjs create` rejects a body without `## Problem / ## Change / ## Done when` or over 1500 chars (same rules as today's hook; unit test).
- [ ] `/platform/board/CORE-12` opens the board with that card's detail open (component test).
- [ ] ship-artifact build: Board button instead of Linear; a marker with `boardUrl` passes quality-gate (hook test).
- [ ] quality-gate and the ticket-format hook name the board, not Linear, in their messages (hook tests).
- [ ] After the cut-over a Linear `save_issue`/`save_comment` call is denied with a pointer to `board.mjs` (hook test).
- [ ] Every Linear issue created after 2026-10-07 exists on the board with the same key; counters advance past the highest imported number.

### Decisions (core187-r1, Łukasz 2026-10-07, all "more")
- Q1 Token: a token table (platform schema) with issue/revoke on the board, one token per device; the plaintext is shown once, only its SHA-256 is stored.
- Q2 Landing: a session ticket goes straight to In Progress with the label `session`; the board gets a filter by that label.
- Q3 Linear: read-only for 30 days (hook denies Claude writes), then a full local export and the workspace is closed (≈ 2026-11-07).
- Q4 Worker: the nightly pipeline switch is a separate ticket, but `linear-worker/SKILL.md` reads the board right away; the cron stays off.

### Added acceptance criteria (from the decisions)
- [ ] Issue a token on the board → plaintext shown once; a revoked token → 401 (integration test).
- [ ] A session-created item carries the label `session`; the board filter shows only those (component test).

### Hand-off
→ `/decision-form` (open questions) → Plan mode → `/arch assess` (actor model + token) → `/dev`.
