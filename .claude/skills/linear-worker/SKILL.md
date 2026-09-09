---
name: linear-worker
description: Nightly autonomous ticket worker — reads one "Ready for Worker" ticket from Linear, runs it through /enrich-user-story and implementation, self-checks against quality-gate.sh's own criteria, and pushes a branch (never a PR, never dev/prod) with a comment back on the ticket. Use when running the nightly Linear worker routine, or when Łukasz wants to manually test/dry-run this flow against a specific ticket.
argument-hint: "[linear-ticket-id | dry-run]"
---

# Linear Worker

> **Focus**: $ARGUMENTS — a specific Linear ticket ID to process instead of auto-selecting (useful for a manual validation run), or empty for the normal auto-select flow.

You process **exactly one** Linear ticket per run, unattended. Nobody is watching this happen — every step below exists to make sure that if anything is even slightly uncertain, you stop and leave a clear note instead of guessing on a medical-grade, compliance-sensitive codebase. See [docs/ADR-019-nightly-linear-worker.md](../../../docs/ADR-019-nightly-linear-worker.md) for why this exists and [docs/stories/nightly-linear-worker.md](../../../docs/stories/nightly-linear-worker.md) for the original story.

> **IMPORTANT**: All output — English only, including Linear comments and commit messages.

---

## Ticket Contract

- **Trigger state**: Linear status `Ready for Worker`.
- **Selection**: highest Linear priority first, then oldest `createdAt` as tie-break. Exactly one ticket per run — never process a second one even if the first finishes early.
- **Fields read**: title + description (the raw input to `/enrich-user-story`), plus any attached screenshots/mockups if the Linear MCP tools available in this session expose attachment content — this is **unverified as of the first run of this skill**; if attachments can't be read, proceed on title + description alone and note in your Linear comment that attachments were not readable, rather than blocking on it.
- **Claim step**: the moment you select a ticket, move it to `Worker: In Progress` before doing anything else. This exists so a second run (or a retry) can never double-process the same ticket, and so Łukasz sees "being worked on" state if he checks mid-run.
- **Terminal states**: `Needs Review` (success) or `Blocked` (any stop condition below). Always leave a comment explaining what happened — a bare status change is not enough.

---

## Procedure

### 1. Orient
Read the repo root `CLAUDE.md` in full.

### 2. Select
Query Linear for tickets in `Ready for Worker`. If `$ARGUMENTS` names a specific ticket ID, use that one instead of auto-selecting (manual/dry-run mode). If none are found and no argument was given, end cleanly — no branch, no push, no comment needed.

### 3. Claim
Move the selected ticket to `Worker: In Progress`.

### 4. Compliance-sensitive scope check — before any implementation

Two categories, judged before writing a single line:

**Always blocked, no exception, ever** — if implementing the ticket requires
any of these, stop regardless of how simple the rest looks:
- Any change to a migration file (`apps/api/migrations/`).
- Any change to `auth.ts`.
- Any change — read or write — to `consent` or `audit_log` backend code.
- Any **new or modified** backend route, query function, or DB access code
  that touches `identities`, `patient`, or `practitioner` — this includes a
  brand-new read-only endpoint or query parameter, not just writes. Backend
  code in this zone only ever gets written by a human, full stop.

**Allowed — the worker may proceed** — a ticket that only needs to *display*
`identities`/`patient`/`practitioner` data by calling an **already-existing,
already-merged backend route or query exactly as it exists today** (including
passing query parameters that route already supports), building new FE-only
code (views/components/composables) around that existing read. No new backend
file, no new backend function, no modified backend function — only reuse,
verbatim, of what's already there.

If it's ambiguous which category a ticket falls into — e.g. you're not certain
whether a suitable existing endpoint/query already covers what's being asked —
treat it as **blocked**. Guessing wrong in the permissive direction is exactly
the failure mode this rule exists to prevent; only proceed when reuse of an
existing read path is unambiguous.

On block:
- Comment on the ticket: "Deferred — requires a human session (touches compliance-sensitive code: [name the specific area, and whether it's the always-blocked category or an ambiguous-reuse case])."
- Move the ticket to `Blocked`.
- End the turn with a clean working tree (nothing to revert yet at this point).

This check is not optional and not something quality-gate.sh's own risk check can substitute for — that check only requires a `.spec.ts` alongside risk-touched code, it doesn't stop you from writing that code unattended in the first place. This one does.

### 5. Enrich
Run `/enrich-user-story` against the ticket's title + description. If it surfaces Open Questions you cannot answer confidently — same standard the skill already applies to a human ("ask, don't assume") — stop:
- Comment the specific open questions on the ticket, verbatim.
- Move to `Blocked`.
- End with a clean working tree.

If classified `trivial` or `feature` with no blocking open questions, proceed. For `feature`, save the Refined User Story to `docs/stories/` as the skill normally requires.

### 6. Implement
Implement the change directly, following every rule in CLAUDE.md unconditionally — TypeScript strict, i18n keys added to `en.json` first, no hardcoded navigation/labels/feature flags, no secrets in frontend code, numbered migration files never mutated. There is no relaxed mode for unattended work; if anything, be more conservative than a human would be about scope creep — implement only what the ticket asks.

### 7. Self-check — run in full before touching git commit

Do **not** rely on the repo's Stop hook (`quality-gate.sh`) to catch problems for you. It only inspects `git status --porcelain` — if you commit everything before ending your turn, it sees a clean tree and passes trivially without checking anything. Run its actual checks yourself, in this order, treating a failure at any step as final (see Step 8 — no retries):

1. Start Postgres:
   ```bash
   docker run -d --name gate-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p 5432:5432 postgres:15
   ```
   Wait for it to report healthy (`pg_isready -h 127.0.0.1`, poll until it succeeds or a reasonable timeout — if Docker itself isn't available in this environment, that's a fatal setup problem, not a per-ticket failure: stop, comment "Environment cannot run Docker — no Postgres available for tests, this ticket needs re-running once the cloud environment is fixed" on the ticket, move to `Blocked`, and do not attempt any other ticket).
2. `export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`
3. `pnpm --filter @neo/api migrate`
4. `pnpm --filter @neo/api sync-test-schema`
5. `pnpm -r lint`
6. `pnpm -r typecheck`
7. `pnpm -r test`
8. `pnpm depcruise`
9. Confirm a file under `docs/` changed in your diff (the Refined User Story from Step 5 satisfies this for feature-classified tickets; trivial tickets don't need one, matching the enrichment skill's own rule).
10. Confirm any file matching `identities|patient|practitioner|consent|auth\.ts|/context/|audit-log\.ts` that you touched has an accompanying `.spec.ts` change (you shouldn't have touched these at all per Step 4, but re-check — this is the actual quality-gate.sh regex, reproduced here for parity).

### 8. On any self-check failure — stop, don't fix, don't retry
This is the one policy Łukasz was explicit about: no self-fix loop, no second attempt.
- `git reset --hard` and remove any new untracked files to restore a completely clean working tree.
- Delete the local branch if you already created one.
- Comment on the Linear ticket with the exact failing check(s) and enough of their output to be actionable (not a full log dump — the specific error).
- Move the ticket to `Blocked`.
- End the turn. A clean tree means the Stop hook exits 0 immediately — you are not fighting it.

### 9. On success — commit, branch, push
- Commit with a clear message. Include a co-authorship trailer identifying this as agent work, same convention as any Claude-authored commit in this repo, so `git blame` is never ambiguous about human vs. agent authorship.
- Branch name: `worker/<linear-ticket-id>-<kebab-slug-of-title>`, created from `dev` (this repo's default branch — confirm via `git remote show origin` if unsure, never assume `main`).
- `git push -u origin worker/<...>`. Never push to `dev` or `prod`. **Never open a pull request** — this is a hard rule, not a preference (see CLAUDE.md's PR-only workflow).
- Comment on the Linear ticket with the exact GitHub "create a pull request" URL git prints after push (`https://github.com/lukasz512/NeoSleep/pull/new/worker/<...>`).
- Move the ticket to `Needs Review`.

---

## Uprawnienia operacyjne

**Może bez pytania:** everything in the Procedure above, including pushing the `worker/*` branch — that's the entire point of this skill running unattended.

**Wymaga potwierdzenia:** nothing, when run as the scheduled nightly routine. When Łukasz invokes this skill manually in an interactive session (e.g. `/linear-worker dry-run` against a specific ticket to validate the flow), treat it as a normal interactive session — confirm before the push step if he's watching, since he can just say go ahead.

---

## Delegation

| Trigger | Delegate to |
|---|---|
| Ticket needs compliance-sensitive changes | Defer to a human session — do not implement, see Step 4 |
| Self-check fails | `Blocked` + comment, see Step 8 — never a fix attempt within this run |
| `quality-gate.sh`'s hardcoded `127.0.0.1:5432` check being stale for normal local dev (no docker-compose exists in this repo; local dev uses remote Supabase) | Known pre-existing issue, out of scope for this skill — flag to `/devops` separately if it becomes a real blocker for human sessions too |
| Scheduling / enabling / disabling the nightly cron | The `RemoteTrigger` routine configuration, not this skill — this skill only defines *what* a single run does |
