# ADR-019: Nightly autonomous Linear worker via RemoteTrigger

## Status
Accepted

## Context
Łukasz is the sole developer on NeoCRM. Every feature and fix today requires him
to be present in a live Claude Code session — writing the ticket, pasting it in,
and waiting for the implementation cycle to finish before moving to the next
thing. This caps throughput at however many hours he can personally spend
driving Claude Code, even though most of that time is waiting on
lint/typecheck/test/implementation cycles that don't need his attention step by
step.

A working precedent for unattended cloud execution already exists: a weekly
`RemoteTrigger` routine (`trig_013DjoW5C8PeieZRCVJtQ83L`, "NeoCRM weekly health
report") runs Claude Code in a cloud environment on a cron schedule, follows a
fixed skill (`.claude/skills/health-report/SKILL.md`), writes output, branches,
pushes, and — critically — never opens a pull request itself. The same
mechanism, pointed at a different skill and a ticket queue instead of a fixed
report, covers this use case without inventing new infrastructure.

## Decision
Add a nightly `RemoteTrigger` routine that processes **one** Linear ticket per
run, following a new `.claude/skills/linear-worker/SKILL.md` (see that file for
the full procedure). Four policy decisions were made explicitly with Łukasz
rather than assumed:

1. **One ticket per night**, not a higher cap or unbounded — the safest starting
   volume; increase later once quality is proven over several nights.
2. **On any quality-gate failure: leave a note on the ticket and stop for the
   night — no self-fix loop.** An unattended agent retrying against its own
   failing tests risks progressively worse diffs with nobody watching; a clean
   failure with a clear note is strictly safer than a desperate autonomous fix
   attempt.
3. **Compliance-sensitive code is always deferred to a human session**,
   regardless of what the Linear ticket's label says: migrations, `auth.ts`,
   `identities`/`consent`/`audit_log`/`patient`/`practitioner`. This is the
   platform's most sensitive code; the risk profile of writing it unattended
   overnight is categorically different from a human writing it live, even with
   an identical test suite behind it.

   **Update, 2026-09-10, after the first real validation run**: the worker
   correctly blocked its first real ticket (an HCO-view "doctors" tab, which
   needs `practitioner` data) — but this domain is a medical CRM, and almost
   any patient/HCP-facing feature touches `identities`/`patient`/`practitioner`
   in some way. An unconditional block on that whole surface would leave the
   worker able to handle only a narrow slice of realistic tickets. Refined the
   rule in `SKILL.md` (not loosened): migrations, `auth.ts`, `consent`,
   `audit_log`, and any **new or modified** backend code touching
   `identities`/`patient`/`practitioner` remain always blocked, no exception —
   but a ticket that only needs to *display* that data through an
   **already-existing, already-merged backend route/query, used exactly as-is**
   may now proceed as FE-only work. Ambiguous cases (not clearly covered by an
   existing read path) still default to blocked. This still requires a human
   to have written and reviewed every line of backend code that ever touches
   this data — the worker is never the first author of it, only ever a
   consumer of an already-reviewed read path.
4. **Linear trigger state is a new status, `Ready for Worker`**, kept separate
   from normal sprint statuses so manually-planned work isn't accidentally
   swept into the nightly run.

**Test database in the cloud environment.** The existing weekly health-report
routine's cloud environment has no Postgres and explicitly skips DB-dependent
checks for that reason. This worker cannot skip them — CLAUDE.md is explicit
that API integration tests must hit a real database, and this worker produces
real code changes to be reviewed and merged. `.github/workflows/ci.yml` already
solves an equivalent problem for GitHub Actions: a `postgres:15` container,
migrated, with an isolated `test` schema synced via
`pnpm --filter @neo/api sync-test-schema`. The worker skill replicates that
exact recipe via `docker run` inside its own cloud session ("Docker-in-cloud")
rather than provisioning a separate always-on Supabase test project — reusing
an existing, already-correct setup instead of adding new infrastructure to
maintain. This is **unverified as an assumption**: it depends on the
RemoteTrigger cloud environment actually supporting Docker, which has to be
confirmed by the first manual validation run before the nightly cron is
enabled.

**quality-gate.sh is not the enforcement mechanism for this worker.** The Stop
hook only inspects `git status --porcelain` (uncommitted changes) — an agent
that commits everything before ending its turn would sail past it having run
no checks at all. The worker skill runs quality-gate.sh's own check sequence
explicitly, before ever committing, so passing is a precondition it enforces on
itself rather than something the hook catches after the fact. The Stop hook
remains an unchanged backstop for ordinary interactive sessions.

**Never opens a PR, never pushes to `dev`/`prod`.** Unchanged from every other
automated routine in this repo — branch + push only, with the GitHub
"create a pull request" URL left as a Linear comment for Łukasz to act on.

## Consequences
- Enables: tickets written during the day can turn into a reviewable branch by
  morning without Łukasz driving the implementation session himself.
- New branch namespace: `worker/<linear-ticket-id>-<slug>`, distinguishing
  agent-initiated branches from human ones at a glance.
- New Linear statuses required: `Ready for Worker` (trigger), `Worker: In
  Progress` (claim, prevents double-processing), `Needs Review` / `Blocked`
  (terminal states) — these need to exist in the Linear workspace before the
  routine is enabled.
- New manual, one-time step outside this repo: attaching the Linear MCP
  connector to this specific routine in the claude.ai Routines UI (connecting
  it at the account level makes it available; each routine still needs it
  attached individually, same as the existing routine's Slack/Drive access).
- Closes: nothing existing changes — the weekly health-report routine and its
  skill are untouched.
- Not addressed by this ADR: `quality-gate.sh`'s `127.0.0.1:5432` reachability
  check is already stale for ordinary local development (this repo has no
  docker-compose file; local dev connects directly to a remote Supabase
  instance per `infrastructure/scripts/start.sh`) — a pre-existing gap
  discovered while investigating this feature, deliberately left out of scope
  here since it doesn't block this worker (its own Docker-in-cloud Postgres
  happens to satisfy that same hardcoded check). **Update, same day**: a
  concurrent, uncommitted change to `quality-gate.sh` (seen in the main working
  tree, not this branch) replaces that hardcoded check with one that reads
  `DATABASE_URL` from `.env` instead. That doesn't break this worker's design —
  the worker skill never depends on the hook's reachability check at all (see
  the `quality-gate.sh is not the enforcement mechanism` point above); it
  exports its own `DATABASE_URL` and runs the test suite directly. Worth a
  reread of this ADR once that other change actually merges to `dev`, in case
  the hook's behavior changes further before then.

## Compliance Impact
Linear ticket content (including any attached screenshots/mockups) enters a
cloud agent's context when the worker reads it. Tickets must never contain real
patient or HCP data — synthetic mockups only, same rule that already applies to
any non-seed content in this codebase. Commits made by the worker carry a
co-authorship trailer identifying them as agent work (same convention already
used for any Claude-authored commit in this repo), so `git blame`/audit history
is never ambiguous about human vs. agent authorship of compliance-adjacent
code — though per the Decision above, the worker is barred from touching
compliance-sensitive code at all, so this is a defense-in-depth clarification
rather than a mitigation for a risk the design otherwise allows.
