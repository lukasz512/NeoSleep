## Refined User Story: linear-worker local test link

**Classification**: feature (internal dev-tooling workflow change — not user/tenant/patient-facing)
**Raw input**: "linear-neo te automatyzacje na taski, super. ale ja to musze testowac sam. potrzebuje zeby byl na koncu komentarza link ktory mi odpali vsc i zbuduje projekt tam gdzie byly te zmiany. musze testowac zimany nim je bede mergowac. jak proponujesz to rozwiazac?" (translated: the linear-worker task automation is great, but I need to test it myself. I need a link at the end of the ticket comment that opens VSCode and builds the project where those changes were made. I need to test the changes before merging them.)

### As Łukasz (repo owner running the nightly worker), I want the worker's ticket comment to include a ready-to-run local command, so that I can pull a worker-produced branch into its own worktree, install/build it, and open it in VSCode to test before merging — without it touching my main working tree.

### Stakeholder Notes
- 👤 User: Solely Łukasz, in his role as the human reviewer/gatekeeper of `linear-worker` output — not a rep/KAM/FFM/MSL. Today he has to manually `git fetch`, figure out the branch name from the ticket, `git worktree add`, `pnpm install`, `pnpm build`, then open VSCode himself — this automates that into one copy-paste command.
- 🏢 Client: No direct tenant impact — this is internal engineering tooling, not something a pharma tenant sees or pays for.
- 🩺 Patient: No downstream effect on patient safety or clinical outcome — purely a local dev-workflow convenience.
- 🚀 NeoCRM/Platform: Not white-label-relevant; doesn't generalize to tenants. It does harden the existing `linear-worker` skill (`.claude/skills/linear-worker/SKILL.md`), which is part of this repo's own delivery process, not the product.
- ⚖️ Compliance: No early flags — no patient/tenant data involved, purely local git/build tooling running against Łukasz's own machine.

### Medical-Industry Trend Check
n/a — internal change (dev tooling / CI-adjacent workflow, not a rep/HCP/patient-facing feature).

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] After `linear-worker` pushes a branch and comments on the Linear ticket, the comment includes a single copy-pasteable command (`pnpm worker:test <branch>`) referencing the exact pushed branch name.
- [ ] Running that command locally: fetches the branch, creates (or reuses) a dedicated git worktree for it (separate from the user's main working tree and any other worker-ticket worktree), runs `pnpm install`, runs the project build, and opens the worktree folder in VSCode (`code <path>`).
- [ ] Running the command twice for the same branch does not error or duplicate the worktree — it reuses the existing one and re-syncs (fetch + install + build) instead.
- [ ] Running the command for a second, different ticket branch does not clobber or interfere with a worktree already checked out for a prior ticket.
- [ ] If the branch no longer exists on the remote (e.g. force-pushed away or deleted), the script fails with a clear error message rather than silently opening a stale/empty checkout.
- [ ] The script and its usage are documented (README or inline `--help`) well enough that Łukasz doesn't need to re-derive the exact invocation each time from the Linear comment alone.

### Open Questions — resolved during implementation
- [x] Worktree location: sibling directory `<repo-parent>/<repo-name>-worker-<branch-with-slashes-dashed>`, fully outside the main repo tree, one per branch. Reused (fetch + `git reset --hard`) on repeat runs; the script refuses to touch it if it has uncommitted changes.
- [x] Build step: `pnpm build:pwa` only (not full `pnpm ci`) — matches "Do not start portal/admin apps until rep app Stage 1-3 is done," and this is a fast local sanity build, not a CI gate; GitHub Actions already runs the full `pnpm ci` before merge. The script prints a reminder to run `pnpm dev` inside the worktree to actually click around.
- [x] Stale worktree cleanup: left manual (`git worktree remove`) for v1 — not automated, to avoid ever deleting something without an explicit human decision.
- [x] GitHub App push-access issue ([[project_linear_worker_github_app_access_broken]]) is unrelated — `worker:test` only fetches and reads, run entirely from Łukasz's own machine with his own git credentials, no push involved.

Verified: `infrastructure/scripts/worker-test.sh` correctly errors on a branch no longer on origin (tested against a deleted branch name), and successfully creates a worktree, fetches, installs, builds `@neo/pwa`, and opens VSCode for an existing branch (tested against `origin/worktree-neo-32-pwa-dev-godaddy-fix`).

### Hand-off
→ `/dev feat linear-worker-local-test-link` — scope is clear and self-contained (new script + a one-line addition to the worker's ticket-comment template); no schema/architecture change needed.
