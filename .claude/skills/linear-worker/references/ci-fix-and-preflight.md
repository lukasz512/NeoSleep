### CI-fix mode — ticket labelled `ci-failed` (NEO-182)

Łukasz, 2026-09-28: a red CI is fixed by the same rules everywhere — this worker, an interactive session (quality-gate.sh) and the GitHub handoff all read **`.claude/ci-autofix.json`** (attempt limit, allowed fix scope, labels, states). Read it first; never restate its numbers from memory. This mode is the one sanctioned exception to Step 8's "no retry" — it fixes an already-reviewed-shape change, bounded by `maxFixAttempts`.

1. Step 2.5 pre-flight still applies (push access). Claim the ticket (`Worker: In Progress`).
2. Find the branch: the ticket's latest comment starting with `<!-- ci-autofix -->` names it (`CI failed on \`<branch>\``). `git fetch origin <branch>` and check it out — the existing branch, never a new one.
3. `node infrastructure/scripts/ci-status.mjs --branch <branch> --sha $(git rev-parse HEAD)`:
   - `success` or `pending` → someone already fixed it or CI is re-running: remove the label, move to `Needs Review`, comment one line, end.
   - `exhausted: true` → don't touch the code: remove the label, move to `linear.exhaustedState`, comment that the limit is used up and what still fails, end.
   - `failure` → go on.
4. Reproduce each failing test locally (`gh run view <runId> --log-failed` for the full error; Vitest file or Playwright spec — harness specs run with `pnpm --filter @neo/pwa exec playwright test -c playwright.harness.config.ts <spec>`). Fix strictly within `allowedFixScope`. If the right fix is outside it (a behaviour decision, a failing test unrelated to this branch), don't fix — go to 7 with that explanation.
5. Run Step 7's self-checks that apply to the touched files, commit (co-author trailer), `git push origin <branch>` — allowed even when a PR is open (`workerMayPushToOpenPr`). Never force-push, never open a PR.
6. Wait for CI on the new HEAD (`node infrastructure/scripts/ci-wait.mjs --max-minutes 30` — one call a minute; never `gh run watch`, CORE-128). Green → remove the label, comment on the ticket and the PR ("CI green after fix: <what was wrong>"), move to `Needs Review`. Red again → comment what you changed and end: the GitHub handoff has already re-queued it (or escalated it once the limit is reached).
7. Could not fix within scope → comment the diagnosis on the ticket and the PR, remove the label, move to `Needs Review`, end.

### 2.5. Environment Pre-flight — before claiming, before any per-ticket work

Added 2026-09-16 after NEO-6 burned 3 days and 6 passes without landing.
Passes 5 and 6 each spent 15-30 minutes on Enrich+Implement+Self-check only
to discover, at the very end, an environment-wide problem that had nothing to
do with the ticket. Pass 5's DB-canary hang is already fixed separately (see
Step 7 step 1's fast reachability probe, added the same day) — that fix isn't
duplicated here. What's still unaddressed, and what this step exists for, is
pass 6's failure mode: `git push` failed on a GitHub App permission gap only
*after* a full implementation had already succeeded, wasting all of it. This
step catches that — and the two DB conditions that are cheap, universal, and
otherwise only discovered after Enrich+Implement — in seconds, before Claim.

Run these against the ticket **Select** already picked, but **do not Claim it
yet** — if pre-flight fails, this ticket was never actually worked on, so it
must stay in `Ready for Worker` (not `Worker: In Progress`) for the next run
to pick up in the same FIFO order:

1. **`DATABASE_URL` presence.** Must already be set in this session's process
   environment (Step 7's rules on where this value may legitimately come from
   apply here too — this is the same check, just moved earlier). If unset:
   comment "Environment has no test DATABASE_URL configured — this ticket
   needs re-running once the cloud environment is fixed" on the selected
   ticket, leave it in `Ready for Worker`, end the run.

2. **DB isolation, reusing Step 7 step 1's fast probe verbatim** (same
   hard-timeout raw-TCP probe, same branching) **but only for its fatal
   outcome.** If the probe connects, run the isolation canary
   (`SELECT 1 FROM neosleep.patient LIMIT 1`) and if it does **not** fail with
   a permission error — returns a row or succeeds with zero rows — that's a
   security misconfiguration: comment "DATABASE_URL for this session is not
   properly isolated (can read the real `neosleep.patient` table) — do not
   proceed, this is a security misconfiguration, not a ticket-specific
   failure" on the selected ticket, leave it in `Ready for Worker`, end the
   run. **A probe timeout is *not* a pre-flight failure** — per Step 7 step 1,
   that's an accepted, documented environment trade-off, not a blocker; proceed
   to Claim and let Step 7 handle the DB-test-skip + completion-comment note
   as it already does, later, in full.

3. **Git push capability — non-destructive dry run (new).**
   `git push --dry-run origin HEAD:refs/heads/_worker-preflight-check`. A
   dry-run negotiates auth with the remote without writing anything — it
   never creates a branch, never touches `dev`/`prod`. If it fails (a 403 or
   any other auth/permission error): comment the exact error on the selected
   ticket, framed as environment-wide exactly like the checks above (e.g.
   "git push access is broken for this environment — [exact error] — this
   needs a human to visit https://github.com/apps/claude/installations/select_target
   and grant/confirm the Claude GitHub App's push access to this repo; it is
   not something this run can fix itself — every ticket is blocked until
   this is fixed, not just this one"), leave it in `Ready for Worker`, end
   the run.

If nothing above ends the run, proceed to Claim. Do not process a second
ticket in this run even if pre-flight failed on the first one — end the turn
either way, per the existing "exactly one ticket per run" rule.

