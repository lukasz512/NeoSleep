## Refined User Story: Worktree cleanup

> **Superseded in part by NEO-84 (2026-09-26)** — see [ship-rules-ticket-links-index-cleanup.md](ship-rules-ticket-links-index-cleanup.md): merged work is now removed automatically at session start (`--auto`), without the Linear "Done" check; local branches without a worktree and squash merges are covered. The safety rules below (never `--force`, never unmerged/dirty/locked) still hold.

**Classification**: feature — changes the dev workflow and deletes local worktrees, local branches and remote branches; "what counts as closed" is a judgment call worth getting right.
**Raw input**: "we need to think about better cleanup of closed worktrees — we don't have it in the project at all. We must add it, now." (Łukasz, 2026-09-24, NEO-50)

### As a developer (Łukasz, or a Claude session working for him), I want closed worktrees and their branches cleaned up safely on demand so that the repo doesn't silently accumulate tens of GB of stale checkouts and dead branches.

### Context
As of 2026-09-24: 34 git worktrees, 18 GB under `.claude/worktrees/`. ~19 are merged into `dev`, clean, remote branch already gone. 5 are merged but hold uncommitted files — some of it real, unsaved work (`neo-27` has an uncommitted `docs/ADR-021-appointment-entity.md`, `neo-14` an uncommitted spec + story). So blind `git worktree remove --force` is not acceptable.

### Decisions (locked with Łukasz, 2026-09-24)
1. **Trigger** — `pnpm worktree:clean` (dry-run by default) plus a SessionStart hook nudge. Nothing is ever deleted automatically.
2. **"Closed"** — all of:
   - branch tip reachable from `origin/dev`, **and** not on `origin/dev`'s first-parent chain (a freshly created branch with no commits of its own sits on that chain — it would otherwise look "merged");
   - 0 uncommitted/untracked files;
   - 0 commits not on `origin/dev`;
   - worktree not `git worktree lock`ed, and not the worktree the command runs from;
   - if the branch name carries a ticket ID (`neo-<n>`), that Linear ticket's status type is `completed` (Done).
3. **Linear check** — via Claude + Linear MCP, not an API key (none exists in the repo). The script only does git; the `/worktree-clean` skill does the Linear step between listing and applying.
4. **Dirty-but-merged** — skipped and reported with the file list. Never touched.
5. **Branches** — remove the worktree, delete the local branch (only if still merged — never forced), and delete the merged remote branch on `origin` — the remote step is outward-facing, so it needs explicit confirmation in the session.
6. **No ticket ID in the branch name** — git conditions alone decide.

### Stakeholder Notes
- 👤 User: the developer; today the only workaround is manual `git worktree remove` per directory, which never happens.
- 🏢 Client: no tenant-facing effect.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: internal dev tooling; keeps disk and branch list manageable as the worker produces more branches.
- ⚖️ Compliance: no early flags. The main risk is data loss of uncommitted work — handled by never touching dirty worktrees.

### Medical-Industry Trend Check
- n/a — internal/infra change.

### Acceptance Criteria
- [ ] `pnpm worktree:clean` with no flags changes nothing and prints each non-main worktree as CANDIDATE or KEEP with a reason.
- [ ] `--json` prints the same classification as JSON (branch, path, ticket, status, reason, dirty files, remote exists).
- [ ] A fresh branch with no own commits (tip on `origin/dev`'s first-parent chain) is KEEP, not CANDIDATE.
- [ ] A worktree with any uncommitted or untracked file is KEEP, and its files are listed.
- [ ] A branch with commits not on `origin/dev` is KEEP.
- [ ] A locked worktree, and the worktree the command runs from, are KEEP.
- [ ] `--apply <branch>...` re-checks every git condition at apply time and refuses anything that no longer qualifies; it never uses `--force`.
- [ ] `--apply` removes the worktree and deletes the local branch — only if it still points at the commit just verified as merged (`git update-ref -d <ref> <sha>`; plain `git branch -d` checks against the main tree's HEAD, which may be behind `origin/dev`).
- [ ] Remote deletion only happens with `--delete-remote`, only for branches merged into `origin/dev`, and never for `dev`/`prod`.
- [ ] Merged remote branches without a local worktree (e.g. old `worker/*` branches) are listed too, so they can be cleaned the same way.
- [ ] The SessionStart hook prints a one-line nudge when there are CANDIDATE worktrees, does no network I/O, and stays silent when there are none.
- [ ] The `/worktree-clean` skill checks each ticket-bearing candidate's Linear status and only passes Done tickets (plus ticketless candidates) to `--apply`, and asks before `--delete-remote`.

### Open Questions
- none

### Hand-off
→ `/dev feat worktree-clean` — scope is clear and self-contained (dev tooling only).
