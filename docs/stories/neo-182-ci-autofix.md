# NEO-182 — CI auto-fix: green CI before the PR link, red CI goes back to a fixer

**Ticket:** NEO-182 · **Decided by Łukasz, 2026-09-28** (form ci-autofix-2026-09) · Trigger: NEO-132 shipped with green local tests and red e2e on GitHub, and nobody was told.

## Decisions
| Question | Answer |
|---|---|
| Which layers | Both: the VS Code session and GitHub → Linear → nightly worker, **with one shared rule set** ("hoisting": every worker follows the same rules) |
| Fix attempts | 2 per branch, then stop and ask Łukasz |
| Wait for CI | Yes. The PR link is handed over only when CI is green |
| Local e2e before push | Yes, when a push changes `.vue`/`.css`/`.scss` |
| Worker pushes to a branch with an open PR | Yes, test fixes only, with a comment on the PR and in Linear |

## How it fits together
- **Rules:** `.claude/ci-autofix.json`. The only place the limit, fix scope, labels and states are written.
- **Verdict:** `infrastructure/scripts/ci-status.mjs` gives none / pending / success / failure for a branch HEAD. It also returns the failing tests (parsed from the Playwright and Vitest logs), the attempt count and whether the limit is used up.
- **Session:** `quality-gate.sh` › `ci_green_check`. Once the branch is pushed:
  - pending blocks the turn (wait).
  - red blocks it with the failing tests (fix, push, wait).
  - red after the limit blocks until the escalation to Łukasz is recorded (`ciEscalated`).
- **CI runs before a PR exists:** `ci.yml` also runs on push to `worktree-*`, `worker/*` and `claude/*`. A concurrency group cancels the duplicate run once the PR is opened.
- **Pre-push:** `infrastructure/scripts/related-e2e.mjs` finds the harness specs a UI change can break (import graph; type-only and lazy route imports don't count). `.husky/pre-push` runs them in Chromium through `apps/pwa/playwright.harness.config.ts`, which needs no API or DB and takes about 20 s.
- **GitHub → Linear:** `.github/workflows/ci-failure-handoff.yml` › `ci-failure-handoff.mjs`. It posts the same comment on the PR and the ticket, then moves the ticket to `Ready for Worker` with the `ci-failed` label. Once the limit is used up, the ticket goes to `Needs Review` instead.
- **Worker:** `linear-worker` CI-fix mode. It runs first in the queue, works on the existing branch within the allowed fix scope, then waits for CI.

## Acceptance criteria
1. A pushed branch with pending CI cannot end the session turn. The message links the run.
2. A red CI names the failing tests and the attempt number (n of 2). After the limit, the session must escalate instead of fixing again.
3. A red CI on GitHub posts one comment with the failing tests on the open PR and on the NEO ticket, and re-queues the ticket for the worker with `ci-failed`.
4. The worker's CI-fix mode fixes on the same branch within scope and never on a new branch. It stops at the limit.
5. A `.vue`/`.css` push runs the related harness e2e specs locally. A failure blocks the push; a missing browser only warns.

## Needs from Łukasz
- GitHub secret `LINEAR_API_KEY` (a Linear personal API key). Without it the handoff only comments on the PR.
