---
name: linear-worker
description: Nightly autonomous ticket worker — reads one "Approved for dev" ticket from the work board, runs it through /enrich-user-story and implementation, self-checks against quality-gate.sh's own criteria, and pushes a branch (never a PR, never dev/prod) with a comment back on the ticket. Use when running the nightly Linear worker routine, or when Łukasz wants to manually test/dry-run this flow against a specific ticket.
argument-hint: "[ticket-id | dry-run]"
---

# Linear Worker

> **Focus**: $ARGUMENTS — a specific ticket ID to process instead of auto-selecting (useful for a manual validation run), or empty for the normal auto-select flow.

You process **exactly one** board ticket per run, unattended. Nobody is watching this happen — every step below exists to make sure that if anything is even slightly uncertain, you stop and leave a clear note instead of guessing on a medical-grade, compliance-sensitive codebase. See [docs/ADR-019-nightly-linear-worker.md](../../../docs/ADR-019-nightly-linear-worker.md) for why this exists and [docs/stories/nightly-linear-worker.md](../../../docs/stories/nightly-linear-worker.md) for the original story.

> **IMPORTANT**: All output — English only, including board comments and commit messages.

---

## Ticket Contract

> **The work board replaced Linear (CORE-187).** Read and write tickets only through the board API, `/api/v1/platform/work/*` on the prod API, with the agent token in the `X-Agent-Token` header (`WORK_BOARD_AGENT_TOKEN_SHA256` on the API holds its hash). Linear is read-only and its MCP writes are denied. Status mapping: `Ready for Worker` = `approved` ("Approved for dev"), `Worker: In Progress` = `building`, `Needs Review` = `needs_review`. The agent may only move `approved → building` and `building → needs_review | approved` (see `AGENT_MOVES` in `apps/api/src/routes/workBoard.ts`); it never sees Triage and never closes. There is no `Blocked` column: a stop condition leaves the card in `building` with a comment that starts with `Blocked:`, and Łukasz moves it. The scheduled run stays off until the pipeline ticket (step 3 of `.claude/local/handoff/work-board-next.md`) re-enables it on the board.

- **Trigger state**: board status `approved` (Approved for dev).
- **Selection**: strict FIFO queue by `created_at` — oldest `approved` ticket first (`GET /items?status=approved`), regardless of priority. Exactly one ticket per run — never process a second one even if the first finishes early.
- **Fields read**: title + description (the raw input to `/enrich-user-story`), plus any attached screenshots/mockups if the card's links expose them; otherwise proceed on title + Problem / Change / Done when alone and note in your board comment that attachments were not readable, rather than blocking on it.
- **Claim step**: the moment you select a ticket, move it to `building` (PATCH `{status: "building", branch}`) before doing anything else. This exists so a second run (or a retry) can never double-process the same ticket, and so Łukasz sees "being worked on" state if he checks mid-run.
- **Terminal states**: `needs_review` (success) or a `Blocked:` comment with the card left in `building` (any stop condition below). Always leave a comment explaining what happened — a bare status change is not enough.
- **Label `ci-failed`** (NEO-182): set by `.github/workflows/ci-failure-handoff.yml` when GitHub CI went red on the ticket's branch. Such a ticket is processed in **CI-fix mode** (below), not the normal procedure, and goes first in the queue — it's already-built work one fix away from review.
- **Optional label `worker:backend-approved`**: a per-ticket, human-reviewed exception to the compliance-sensitive scope check for new backend code on `identities`/`patient`/`practitioner` only — see Step 4. Requires an accompanying scoping comment to mean anything; never applies to migrations/`auth.ts`/`consent`/`audit_log`.

---

## Procedure

Details for each step live in `references/`; read the matching file when you reach that step.

1. **Orient** - read the repo root `CLAUDE.md` in full.
2. **Select** - query the board for `approved`. If `$ARGUMENTS` names a ticket, use it (manual/dry-run). None found and no argument: end cleanly (no branch, push or comment). A `ci-failed` ticket goes first and runs in CI-fix mode instead of steps 3-9. CI-fix mode and the environment pre-flight (step 2.5, run before claiming; a failed pre-flight leaves the ticket in `approved` with a comment): `references/ci-fix-and-preflight.md`.
3. **Claim** - move the ticket to `building`.
4. **Compliance-sensitive scope check** before any implementation. Always blocked: migrations, `auth.ts`, `consent`/`audit_log` backend code, any new or modified backend code touching `identities`/`patient`/`practitioner`. If blocked: `Blocked:` comment, leave it in `building`, end with a clean tree. Full rules and override format: `references/compliance-scope-check.md`.
5. **Enrich** - run `/enrich-user-story`; unanswerable open questions mean a verbatim `Blocked:` comment, clean tree. Feature tickets get a story doc in `docs/stories/` with a platform-vs-client line; ambiguous designs go through `/arch assess`. Details: `references/enrich.md`.
6. **Implement** - follow CLAUDE.md unconditionally, only what the ticket asks. If step 5 flagged `ambiguous`, run the double-implementation pass: `references/double-implementation.md`.
7. **Self-check** (run it yourself, do not rely on the Stop hook): DB reachability probe, build compiled packages, lint, typecheck, tests, depcruise, docs diff, spec for risk-touched files, then the backward consistency check (7.5). Full list: `references/self-check.md`.
8. **On any self-check failure**: stop, no fix, no retry. `git reset --hard`, remove untracked files, delete the local branch, comment the exact failing checks (`Blocked:`), end the turn.
9. **On success**: commit (agent co-author trailer), branch `worker/<ticket-id>-<slug>` from `dev`, `git push -u origin`, never push dev/prod, never open a PR. Completion Artifact with the marker file, pre-filled compare URL in the board comment, wait for CI, move to `needs_review`. Full details: `references/on-success.md`.

---

---

## Uprawnienia operacyjne

**Może bez pytania:** everything in the Procedure above, including pushing the `worker/*` branch — that's the entire point of this skill running unattended.

**Wymaga potwierdzenia:** nothing, when run as the scheduled nightly routine. When Łukasz invokes this skill manually in an interactive session (e.g. `/linear-worker dry-run` against a specific ticket to validate the flow), treat it as a normal interactive session — confirm before the push step if he's watching, since he can just say go ahead.

---

## Delegation

| Trigger | Delegate to |
|---|---|
| Ticket needs compliance-sensitive changes | Defer to a human session — do not implement, see Step 4 |
| Ticket implementation isn't an obvious single path | `/arch assess [feature]`, see Step 5's ambiguity check and [_contracts/arch→linear-worker.md](../_contracts/arch→linear-worker.md) |
| Self-check fails (including Step 7.5's backward consistency check) | `Blocked` + comment, see Step 8 — never a fix attempt within this run |
| GitHub CI red on a ticket branch (`ci-failed` label) | CI-fix mode, bounded by `.claude/ci-autofix.json` — the only sanctioned fix loop |
| `quality-gate.sh`'s hardcoded `127.0.0.1:5432` check being stale for normal local dev (no docker-compose exists in this repo; local dev uses remote Supabase) | Known pre-existing issue, out of scope for this skill — flag to `/devops` separately if it becomes a real blocker for human sessions too |
| Scheduling / enabling / disabling the nightly cron | The `RemoteTrigger` routine configuration, not this skill — this skill only defines *what* a single run does |
| Step 2.5 pre-flight fails (DB or git push, including a 403 GitHub App access gap) | Environment-wide problem, not this ticket's — comment (pointing at https://github.com/apps/claude/installations/select_target for a push failure) + leave in `Ready for Worker` per Step 2.5, needs a human to fix the environment before any ticket can proceed |
