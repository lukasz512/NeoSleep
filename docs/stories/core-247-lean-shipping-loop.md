## Refined User Story: Lean shipping loop (CORE-247)

**Classification**: feature (internal tooling: it changes how every session hands a change over)
**Raw input**: "I want before and after recorded visibly on the ticket, ideally in every artifact when an element is new or changed. One session should be one ticket and all of it coherent; several tickets in one session are fine when it makes sense and the tasks are small. I want to use resources better and tidy up the calls."

### As Łukasz, I want the handover of a change to cost one pass and to show before/after on the board card, so that the Claude subscription lasts the month and I can review a ticket without opening anything else.

### Stakeholder Notes
- 👤 User: Łukasz reviews every change from the board card. Today the card has a 2-sentence summary and links; what actually changed is only inside the Artifact.
- 🏢 Client: no direct effect. Indirectly, the same budget ships more tickets.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: applies to every tenant's work, since the harness is shared (team CORE).
- ⚖️ Compliance: no early flags. Transcripts are read locally by the usage script; nothing leaves the machine.

### Medical-Industry Trend Check
- n/a — internal change

### Measured (transcripts, model calls dated 2026-11-09 → 2026-11-18)
`node infrastructure/scripts/session-usage.mjs --since 2026-11-09 --until 2026-11-19` reproduces these. An earlier ad-hoc measurement filtered by file date and pulled in a September session, which is why the script filters by each call's own timestamp.
- 27 sessions, 4586 model calls, 545M tokens read, 95 compactions.
- 51.6% of the tokens (2249 calls) were read after `/ship-artifact` first started in the session. That includes any further work done in the same session after the first handover, so it is an upper bound for the handover itself.
- After the handover started: 218 CI wait/poll calls (5.1%), 70 artifact builds, 47 publishes, 101 artifact data/comment calls, 85 screenshot runs and 61 screenshot reads, 64 dev-verify calls.
- 99 quality-gate blocks, each one a full-context turn: 59 "CI pending / not started", 19 dev verify, 10 CI red, 11 other.
- 99.5% of the tokens were read by calls with a context over 60k; 65% over 115k.

### Acceptance Criteria (testable)
- [x] `build.mjs render` refuses content without `beforeAfter`, `before` + `after`, or `added`, and prints the before/after lines inside the board comment text (`handover.test.mjs`).
- [x] `build.mjs light … --before … --after … --post` (or `--new …`) posts one board comment with summary, before/after, PR link and branch, moves the ticket to Needs Review and writes the marker; without before/after it refuses.
- [x] The board CLI works from a worktree: the session token is read from the main checkout when the worktree has none (`board.test.mjs`).
- [x] A second `ci-wait.mjs` for the same commit exits 3 without polling; a stale lock is taken over (`ci-wait.test.mjs`).
- [x] While a CI wait is running for HEAD, the quality gate warns instead of blocking; without one it blocks once and names the single command to start (`post-push.test.sh` covers the lock helpers).
- [x] After a push on a CI branch the post-push hook prints the one background wait command (`post-push.test.sh`).
- [x] The third render for the same ticket prints a warning (`handover.test.mjs`).
- [x] `session-usage.mjs` counts a call only when its own timestamp is in the window and reports the post-ship share, steps, gate blocks and context sizes (`session-usage.test.mjs`).
- [x] `CLAUDE.md` and `docs/CLAUDE_WORKFLOW.md` state the session rule: one ticket per session, small related tickets may share one while the context stays under ~90k.
- [ ] Post-ship share under 15% on sessions that start after this is merged (measurable only then, with the script).

### Open Questions
- none

### Follow-ups (separate tickets)
- A single wait for the dev deploy + smoke after a merge, the same way as the CI wait (second largest group of gate blocks).
- `board attach`: put before/after screenshots on the card itself (the API endpoint exists).

### Hand-off
→ `/dev` — scope is clear and self-contained
