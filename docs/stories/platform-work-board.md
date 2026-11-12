## Refined User Story: Platform work board (own kanban, replaces Linear)

**Classification**: feature (workflow change, new platform-level data, new agent permissions)
**Ticket**: CORE-177
**Raw input** (Łukasz, 2026-10-07): "chcialbym tez zrezygnowac z linear, chce miec taki kanban w adminie" · "pominiemy linear. uzyjemy jego historii, odchudzimy ja. zostawimy to co wazne - musimy sie pozbyc szumu z AI" · "admin bedzie mial liste z taskami, core i neo, potem mozemy to rozwinac. pamietaj ze bedziemy mieli wielu klientow" · "chcialbym uzywac kanban chyba najbardziej, ale zrob jak to powinno slusznie byc."
**Decisions**: decision forms `worker-pipeline-r1` (D1–D5) and `kanban-r1` (K2–K5), all answered "more"; see `.claude/local/handoff/worker-pipeline-redesign.md`.

### As the platform owner, I want one kanban board for every team (CORE + each client) inside the platform, so that I can plan, approve agent work at night and see what is ready to merge without Linear's 250-issue cap.

### Stakeholder Notes
- 👤 User: Łukasz (platform owner) + the nightly agent. Today: Linear free plan (capped, full), worker reads Linear through a routine.
- 🏢 Client: invisible to tenants (403). Later, a client's own team key (NEO, AJM, …) can be shown to that client; not in v1.
- 🩺 Patient: no direct effect. Indirect: design controls for a medical-grade product (traceable change → review → release).
- 🚀 Platform: teams are data (`platform.work_team`), never hardcoded CORE/NEO, so a new client is one row.
- ⚖️ Compliance: segregation of duties (agent cannot approve or close its own work), append-only event trail (ISO 13485 §7.3 / IEC 62304 §5.1, §8.2 change control, SOC 2 CC8.1). No PHI on the board (tickets describe software, not patients).

### Flow (statuses, in board order)
`triage → backlog → to_spec → spec_ready → approved → building → needs_review → done` (+ `canceled`, hidden column).
- Triage: tester reports land here (CORE-158 link, v1.1). The agent never reads Triage.
- To spec → Spec ready: nightly Spec run (read-only) writes the spec artifact link.
- Spec ready → Approved for dev: **human only** (gate 1).
- Approved → Building → Needs review: nightly Build run, draft PR link + CI link.
- Needs review → Done: **human only** (gate 2, after merge).

### Acceptance Criteria (decided by default — tests prove them)
1. Every `/api/v1/platform/work/*` route answers 401 without login, 403 for a tenant admin, 200 for a platform admin. → `workBoard.spec.ts › access`
2. A new item gets `KEY-n` with n = the team's next number; numbers never repeat, even concurrently. → `› numbering`
3. Every create / status move / comment / field edit writes one `platform.work_item_event` row with actor and actor kind; events cannot be updated. → `› audit trail`
4. Agent token (header `X-Agent-Token`, hash in env `WORK_BOARD_AGENT_TOKEN_SHA256`) may only: read items outside Triage, comment, add links, and move `to_spec→spec_ready`, `approved→building`, `building→needs_review|approved`. Anything else → 403. → `› agent scope`
5. Unknown status, empty title, title > 200, body field > 5000 → 400 with `field`. → `› validation`
6. Board: columns in the order above, team filter chips from `/teams`, card shows KEY-n, title, priority and artifact/PR/CI link icons. Phone width: one list grouped by status. → `WorkBoardView.spec.ts`
7. Shortcuts: `/` search, `n` new item, `Esc` close detail. → `WorkBoardView.spec.ts`
8. Linear import is slimmed: keeps title, Problem/Change/Done when, status, priority, PR/artifact links, decision comments and Łukasz's own (non-English) comments, each ≤ 5 lines; drops "Work started…", "Pushed…", "Implemented…", ci-autofix, worker run reports. Team counters continue after the highest imported number. → `linearImportSlim.test.mjs`

### Out of scope (v1.1+)
Cycles/projects, drag-and-drop ordering inside a column, tester reports auto-landing in Triage, client-visible boards, worker switch-over (separate ticket: worker pipeline).

### Open Questions
None. The forms answered them all.
