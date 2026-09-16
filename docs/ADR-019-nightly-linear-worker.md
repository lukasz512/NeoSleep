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

   **Update, 2026-09-16: cadence bumped from nightly to hourly** (`RemoteTrigger`
   `cron_expression` changed from `7 3 * * *` to `7 * * * *`). Łukasz asked for
   every 30 minutes for faster reaction to newly-queued tickets; the Routines
   API enforces a 1-hour minimum interval between runs, so hourly is the
   closest available. This changes only how *often* the queue is checked, not
   the per-run cap — still exactly one ticket per run (Ticket Contract in
   `SKILL.md` is unchanged), and an empty queue still exits cleanly with no
   branch/comment (`SKILL.md` Step 2). Worth noting honestly: this was done on
   request, not because the "quality proven over several nights" bar above was
   clearly met — today's runs (2026-09-16) hit environment failures (unreachable
   `DATABASE_URL`, incomplete `pnpm install` in the cloud sandbox — see Linear
   NEO-9), not a code-quality signal either way. Revisit actual throughput
   safety once a ticket has cleanly gone all the way through on this cadence.
2. **On any quality-gate failure: leave a note on the ticket and stop for the
   night — no self-fix loop.** An unattended agent retrying against its own
   failing tests risks progressively worse diffs with nobody watching; a clean
   failure with a clear note is strictly safer than a desperate autonomous fix
   attempt.

   **Update, 2026-09-16, after NEO-6's 6-pass history**: this policy is
   unchanged and not being loosened, but its *placement* was costing real
   effort. Pass 5 hit a DB-canary hang and pass 6 hit a `git push` GitHub App
   permission failure — both environment-wide, neither ticket-specific — but
   both were only discovered at the very end of a run, after Enrich+Implement
   had already spent 15-30 minutes. Added `SKILL.md` Step 2.5: an environment
   pre-flight (DB reachability/isolation reusing the fast-probe fix already
   added the same day for the canary hang, plus a new non-destructive
   `git push --dry-run` check) that runs *before* Claim. On failure, the
   selected ticket is left untouched in `Ready for Worker` (not moved to
   `Blocked` — it was never actually worked) and the run ends with a comment
   explaining the environment problem. Separately, NEO-6 passes 2 and 3 also
   burned two extra cycles because a plain "try again" comment doesn't
   satisfy Step 4's override mechanism — a human describing what they want in
   their own words isn't the same as the exact required format. Step 4 now
   requires the block comment to include a ready-to-paste approval template
   whenever exactly one unambiguous scoped fix is identifiable, rather than
   only describing the mechanism. Neither change touches Step 4's compliance
   gate or this item's no-retry policy — both are strictly about failing
   faster and communicating more clearly on the way to the same blocks.
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

   **Update, 2026-09-10, second validation run**: the worker re-verified from
   scratch (not trusting the prior block as stale) and correctly blocked the
   same ticket again — no reusable read path for "practitioners of this HCO"
   exists yet. Łukasz wanted this specific ticket unblocked without a general
   loosening. Added a **per-ticket override**: the Linear label
   `worker:backend-approved`, valid only combined with a comment from Łukasz
   describing the exact backend change approved — the worker implements only
   what that comment literally covers, nothing more. This still never applies
   to migrations/`auth.ts`/`consent`/`audit_log` (no override path for those,
   by design — not to be extended later without revisiting this ADR), and
   Step 7's self-check/`.spec.ts` requirement is unaffected by the override.

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

**Update, 2026-09-10, Docker-in-cloud confirmed non-viable.** Third real
validation run surfaced two independent failures: the environment's Docker
daemon isn't running by default, and once started manually, pulling
`postgres:15` from Docker Hub is blocked by the sandbox's network policy
(403 on `production.cloudfront.docker.com`). Separately, Łukasz confirmed he
hasn't used Docker anywhere in this project in a long time — there's no
appetite to fix a Docker dependency he doesn't otherwise want. This project
also has only **one Supabase Postgres instance** (CLAUDE.md: "single instance
for MVP") — no separate dev/test/prod DB projects to fall back to.

Replaced Docker-in-cloud with: a **permanent dedicated `test` schema inside
that same Supabase instance**, provisioned the same way any real tenant schema
is (`create_tenant_schema()`), reached by the worker through a **separate,
restricted Postgres role** whose grants are limited to that one schema — no
`GRANT` of any kind on `neosleep`, `fourseasons`, or `platform`. This was
reviewed from three angles before adopting it:

- **`/arch`**: reuses the existing schema-per-tenant mechanism as-is (`test` is
  just another schema, provisioned the same way) — no new tooling, no new
  script, no second paid Supabase project (which would also contradict the
  existing "single instance for MVP" decision for no real isolation gain over
  a role-scoped schema in the same instance).
- **`/audit`** — verdict **PASS with required mitigations**, not an open
  concern: the role must be freshly created with explicit `GRANT`s scoped to
  `test` only (including `ALTER DEFAULT PRIVILEGES` so future migrated tables
  stay covered) and zero grants anywhere else; the restricted role's
  connection string must be the *only* `DATABASE_URL` ever present in this
  worker's cloud environment — the real Supabase service credential must never
  be reachable there at all, so even a fully compromised or prompt-injected
  session has no elevated credential to reach for. The worker skill (Step 7)
  now runs an explicit **canary check** every single run — confirm the
  restricted role gets a permission error reading `neosleep.patient` — turning
  "assumed isolated" into something verified on every run, not just at setup
  time.
- **`/legal`**: co-locating a schema with zero real personal data in the same
  physical instance as patient/HCP data does not by itself create a GDPR/
  LFPDPPP concern — GDPR governs personal data, not infrastructure topology —
  **provided** the schema genuinely never receives real data, which is exactly
  what the role-based isolation (verified by the canary check above) is
  responsible for holding true. Fixture data in `test` must be synthetic from
  day one and stay that way — never derived from real patient/HCP records,
  even "anonymized" ones. The worker's restricted DB credential is a new
  non-human service identity and should be tracked in `secrets/accounts.md`
  like any other service account, attributed clearly as
  "nightly Linear worker — test schema only, zero access to personal data."

**Update, 2026-09-10, provisioned and verified.** `test` schema created via
`pnpm --filter @neo/api migrate && sync-test-schema` (not by calling
`create_tenant_schema('test')` directly — that function alone is stale
relative to later migrations, per `sync-test-schema.ts`'s own comment, and
failed with a broken FK on first attempt, confirming exactly that gap).
Restricted role `linear_worker_test` created and empirically verified against
the real instance: connects only via Supabase's session pooler (the direct
`db.<ref>.supabase.co` host is IPv6-only and unreachable from this sandbox —
same class of issue as the earlier Docker-in-cloud finding, network
assumptions here need testing, not guessing), gets `permission denied for
schema neosleep` on the canary read (isolation confirmed real, not assumed),
and has working read/write/create on `test`.

One consequence discovered during verification, not anticipated when this
design was proposed: the restricted role **cannot** run
`pnpm --filter @neo/api migrate` (needs write access to
`public.schema_migrations`) or `sync-test-schema` (`pg_dump`/`LOCK TABLE`
needs read access to `neosleep`) — both fail with `permission denied` under
this role, which is the isolation working as intended, not a bug. Consequence:
the worker's own nightly run **cannot refresh `test`'s structure** — that has
to be done by a human-supervised session (the same `migrate`/
`sync-test-schema` commands, run with normal full credentials) whenever a
migration actually changes the schema. `test` can drift stale between
migrations and the next manual refresh; a worker run hitting that will see it
as a test failure and should report it as an environment-staleness note, not
attempt a code fix. This is a real operational tradeoff versus CI's always-
fresh ephemeral container, accepted in exchange for not needing Docker or
broadening the restricted role's grants.

**Update, 2026-09-16: raw TCP to Postgres confirmed unavailable inside the actual RemoteTrigger cloud sandbox — the 2026-09-10 verification above almost certainly ran from a session with normal network access, not from inside an unattended cloud run, and that gap is exactly what surfaced today.** Three real nightly-worker runs today all hung on the isolation canary check (`psql` never returning, not even a fast connection-refused); a targeted raw-TCP probe with no `psql`/`pg` involved at all — `timeout 8 bash -c 'exec 3<>/dev/tcp/<supabase-host>/5432 && echo CONNECTED'` — also timed out with zero response. Checking this sandbox's own agent-proxy status confirmed why: it proxies HTTP/HTTPS egress only; there is no path for raw TCP on an arbitrary port, Postgres included. This is the same category of "sandbox network policy blocks it" finding as the Docker-in-cloud reversal earlier in this ADR — except this time it affects the *replacement* design, not just the original one. No Network Access allowlist configuration fixes this — allowlisting controls which HTTP(S) hosts are reachable through the proxy, not whether non-HTTP protocols are proxied at all.

**Decision**: the worker's Step 7 self-check now runs a fast (~8s) reachability probe first. When DB is unreachable — expected for every unattended cloud run until/unless this sandbox constraint changes — it skips the isolation canary and the `@neo/api` DB-backed test suite entirely (still runs lint, typecheck, `@neo/ui` tests, and depcruise), and says so explicitly in its Linear completion comment rather than silently proceeding as if verified. This was discussed directly with Łukasz and reasoned through against medical-grade practice, not assumed: a worker-pushed branch is pre-review, pre-CI, pre-merge — `.github/workflows/ci.yml` already runs the full suite against a real ephemeral Postgres container on every push, so the actual compliance-grade gate before anything reaches `dev` is unaffected; the worker's own self-check was always a fast local subset of that gate, not a replacement for it, the same relationship any developer's local pre-commit checks have to CI. This holds specifically *because* Step 4 already excludes the worker from ever touching migrations/`auth.ts`/`consent`/`audit_log`/`identities`/`patient`/`practitioner` — exactly the code where an unverified DB assumption would be most dangerous — so the tickets this worker can even attempt are already the lower-risk category where this trade-off is acceptable. If this sandbox constraint is ever lifted (or Step 7's probe should ever connect successfully in some future cloud environment), the full canary-and-test flow resumes automatically — nothing about that path was removed, only made conditional.

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

**Update, 2026-09-16: before/after screenshots, best-effort.** Łukasz wanted
visual confidence on what a UI ticket actually changed without checking out
the branch himself (see `docs/stories/worker-before-after-screenshots.md` for
the full enrichment pass). Step 9 now optionally captures a before/after
screenshot pair for tickets with a self-contained visual change — same class
as an isolated single Vue SFC or style file, not a full authenticated page —
committed to the worker's own branch under
`docs/worker-screenshots/<linear-ticket-id>/`, attached to the Linear
completion comment, and referenced via `raw.githubusercontent.com` in a
pre-filled GitHub compare URL (`?quick_pull=1&title=&body=`) so the images
render the moment Łukasz opens the PR form — he still clicks "Create" himself,
so this doesn't touch the "never opens a PR" rule above.

Investigation before building this found **no headless-browser or
screenshot-capable dependency anywhere in this monorepo** — no Playwright,
Puppeteer, canvas, `sharp`, `@vitest/browser`, no CI precedent. Adding one as
a new devDependency for this would repeat the exact Docker-in-cloud mistake
this same ADR already reversed above: unwanted infra Łukasz doesn't want to
maintain, for a capability that turns out to already exist elsewhere — a
prior worker validation run rendered an isolated `AppIcon.vue` fix to
`preview.html`/`preview.png` successfully inside its own cloud sandbox, which
means that rendering capability belongs to the RemoteTrigger cloud runtime
itself, not this repo. Step 9 therefore references it generically ("whatever
image-rendering capability the environment already provides") rather than
naming a specific tool this repo would need to install and maintain.

This capture only ever runs after Step 7's self-check has already passed —
it is strictly best-effort, never a new gate: a missing or failed render is
never a self-check failure, never triggers `Blocked`, and never blocks ticket
completion. The synthetic-data-only rule from Compliance Impact below applies
here too, extended to this new visual surface, not just DB rows.

## Consequences
- Enables: tickets written during the day can turn into a reviewable branch
  within about an hour (see 2026-09-16 cadence update above) without Łukasz
  driving the implementation session himself.
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
- New manual, one-time infrastructure step: provisioning the `test` schema
  (via `create_tenant_schema()`, slug `test`) and a restricted Postgres role
  scoped to it in the existing Supabase project, then setting that role's
  connection string as `DATABASE_URL` in this routine's environment variables
  (never in a committed file). See the 2026-09-10 update above.
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
- New path, `docs/worker-screenshots/<linear-ticket-id>/`: before/after PNGs
  from the 2026-09-16 update above. These become permanent git history once a
  worker branch carrying them merges to `dev` — an accepted trade-off, not an
  oversight (see `docs/stories/worker-before-after-screenshots.md`'s resolved
  Open Questions for the alternative considered and why it wasn't chosen).

## Compliance Impact
The worker's dedicated `test` schema (same Supabase instance, restricted
Postgres role) must hold **only synthetic/fixture data, never real patient or
HCP records** — including never seeding it from an "anonymized" export of real
data. Co-locating a schema with zero real personal data alongside real
tenant schemas in the same instance does not by itself raise a GDPR/LFPDPPP
concern, but that conclusion holds only as long as the isolation is genuinely
enforced — the Step 7 canary check exists specifically to keep that an
engineering fact, not an assumption. The restricted role is effectively a new
non-human service identity with its own DB credential; it should be recorded
in `secrets/accounts.md` like any other service account, attributed as
"nightly Linear worker — test schema only, zero access to personal data."

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
