#!/usr/bin/env bash
# Stop hook: mandatory quality gate for NeoCRM (white-label medical CRM — GDPR/HIPAA/LFPDPPP).
#
# Fires on every Stop event. Only actually gates when the working tree has uncommitted
# changes under apps/*/src or packages/*/src — a pure chat/planning/doc-only turn exits
# immediately with no output (default: continue).
#
# Scope of what's checked here reflects an explicit decision (2026-09): hard block (not a
# warning), full rigor on identity/auth/consent/audit_log code, docs/ must actually change,
# feature-shaped changes need a saved /enrich-user-story output. Partner-API integrations
# (OrthoApnea etc.) are explicitly NOT gated here yet.
#
# 2026-09-20: added a visual-artifact check (Łukasz was getting Linear tickets with nothing
# but text — "AI slop" — and wanted a forced visual summary he can actually look at). Same
# self-reported pattern as the docs/stories check below: this script can't call the Artifact
# tool or the Linear MCP itself (it's a shell script, not Claude), so it can only verify that
# a marker file was written recording that an artifact was published and attached. See the
# ARTIFACT MARKER block for what Claude is expected to do when this fires.
#
# Caveat: this checks the CURRENT WORKING TREE STATE (git status), not strictly "what this
# one turn changed" — if the tree already had unrelated uncommitted changes before this
# session started, they're included in what gets checked. Known limitation, not a bug.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$REPO_ROOT" || exit 0

# --- Manual human-only override -------------------------------------------------------
# Claude cannot create or edit this file (it must ask the user to run this outside the
# gated flow); it exists purely as an emergency escape hatch for Łukasz. Valid for one day.
OVERRIDE_FILE=".claude/local/gate-override.txt"
if [ -f "$OVERRIDE_FILE" ]; then
  OVERRIDE_DATE="$(head -1 "$OVERRIDE_FILE" 2>/dev/null | tr -d '[:space:]')"
  if [ "$OVERRIDE_DATE" = "$(date +%Y-%m-%d)" ]; then
    jq -n '{systemMessage: "Quality gate manually overridden today via .claude/local/gate-override.txt — checks were NOT run."}'
    exit 0
  fi
fi

CHANGED="$(git status --porcelain -- apps packages docs 2>/dev/null | awk '{ $1=""; print substr($0,2) }')"
SRC_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^(apps|packages)/[^/]+/src/' || true)"

if [ -z "$SRC_CHANGED" ]; then
  exit 0
fi

FAILS=()
mkdir -p /tmp/neocrm-gate

run_check() {
  local name="$1"; shift
  if ! "$@" >"/tmp/neocrm-gate/$name.log" 2>&1; then
    FAILS+=("pnpm $name failed — see /tmp/neocrm-gate/$name.log for the last run's output")
  fi
}

run_check "lint" pnpm lint
run_check "typecheck" pnpm typecheck

# apps/api integration tests hit a real Postgres (CLAUDE.md: "No mock PostgreSQL in BFF
# integration tests") — give a clear, actionable failure instead of a wall of ECONNREFUSED
# stack traces when the DB isn't reachable.
#
# DB is remote Supabase (see infrastructure/scripts/start.sh), not local — apps/api's own
# "dev" script loads it via `tsx --env-file=../../.env`, but "test" is plain `vitest run`
# and does not, so without loading .env here too, pg falls back to its default
# localhost:5432 and this check misreports a reachable remote DB as "Postgres down".
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . .env
  set +a
fi

DB_HOST="$(printf '%s' "${DATABASE_URL:-}" | sed -n 's#.*://[^@]*@\([^:/]*\).*#\1#p')"
DB_PORT="$(printf '%s' "${DATABASE_URL:-}" | sed -n 's#.*://[^@]*@[^:/]*:\([0-9]*\).*#\1#p')"
DB_PORT="${DB_PORT:-5432}"

# Node's net.connect, not bash's /dev/tcp redirection — the sandbox this hook can run
# under kills the /dev/tcp file-descriptor trick outright (SIGKILL) even when the target
# is genuinely reachable (confirmed: psql and `pnpm test` both connect fine to this same
# Supabase host when /dev/tcp reports it "unreachable"), so /dev/tcp produced false
# negatives here. Node is already a hard requirement for this repo, so this has no new
# dependency.
if [ -n "$DB_HOST" ] && node -e "
    const s = require('net').createConnection({ host: process.argv[1], port: Number(process.argv[2]), timeout: 5000 });
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('timeout', () => process.exit(1));
    s.on('error', () => process.exit(1));
  " "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  # Only the workspaces this diff actually touched — not blanket `pnpm -r test`. A
  # pre-existing, unrelated failure in some other untouched workspace (e.g. apps/web's
  # vitest config choking on a Vuetify CSS import) would otherwise permanently block
  # every future turn regardless of what's being worked on, which defeats the point of
  # a per-change gate.
  AFFECTED_DIRS="$(printf '%s\n' "$SRC_CHANGED" | sed -E 's#^(apps/[^/]+|packages/[^/]+)/.*#\1#' | sort -u)"
  FILTER_ARGS=()
  while IFS= read -r dir; do
    [ -n "$dir" ] && FILTER_ARGS+=(--filter "./$dir")
  done <<< "$AFFECTED_DIRS"
  run_check "test" pnpm "${FILTER_ARGS[@]}" test
else
  FAILS+=("Database at ${DB_HOST:-<DATABASE_URL not set in .env>}:${DB_PORT} is not reachable — check .env's DATABASE_URL (Supabase connection string) and network connectivity before tests can run.")
fi

run_check "depcruise" pnpm depcruise

# Maintenance-only carve-out (2026-09-15): pure test-harness plumbing (vitest setup/global-
# setup files) or added/changed spec files alone don't represent an architecture decision —
# only src/ changes that are actual application code do. Requiring an ADR for e.g. a vitest
# CSS-transform config fix or a new test was blocking genuine maintenance work. A
# feature-shaped change (new view/route/migration) still requires docs via FEATURE_SHAPE
# below regardless of this carve-out, and RISK_TOUCHED below still independently requires a
# spec file alongside any identity/auth/consent/audit_log change.
NON_MAINTENANCE_SRC="$(printf '%s\n' "$SRC_CHANGED" | grep -vE '(^|/)(vitest\.setup\.ts|vitest\.global-setup\.ts|[^/]+\.(spec|test)\.ts)$' || true)"

DOCS_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^docs/' || true)"
if [ -z "$DOCS_CHANGED" ] && [ -n "$NON_MAINTENANCE_SRC" ]; then
  FAILS+=("No file under docs/ changed in this diff. A real ADR/architecture.md/API_CONTRACT.md edit is required — if genuinely no doc change is needed, that has to be an explicit statement to the user, this gate cannot judge intent.")
fi

RISK_TOUCHED="$(printf '%s\n' "$SRC_CHANGED" | grep -E 'identities|patient|practitioner|consent|auth\.ts|/context/|audit-log\.ts' || true)"
if [ -n "$RISK_TOUCHED" ]; then
  RISK_SPEC="$(printf '%s\n' "$SRC_CHANGED" | grep -E '\.spec\.ts$' || true)"
  if [ -z "$RISK_SPEC" ]; then
    FAILS+=("Diff touches identity/auth/consent/audit_log code ($(printf '%s' "$RISK_TOUCHED" | tr '\n' ' ')) but no .spec.ts file changed alongside it. This is a compliance-critical zone — see .claude/skills/qa/SKILL.md mandatory test types (login, 401, tenant isolation, audit log written, password reset).")
  fi
fi

FEATURE_SHAPE="$(printf '%s\n' "$CHANGED" | grep -E '^(apps/[^/]+/src/(views|routes)/|apps/api/migrations/)' || true)"
if [ -n "$FEATURE_SHAPE" ]; then
  STORY_FILE="$(printf '%s\n' "$CHANGED" | grep -E '^docs/stories/.*\.md$' || true)"
  if [ -z "$STORY_FILE" ]; then
    FAILS+=("Diff looks feature-shaped (new view/route/migration: $(printf '%s' "$FEATURE_SHAPE" | tr '\n' ' ')) but no docs/stories/*.md was added. Run /enrich-user-story first and save its 'Refined User Story' output there.")
  fi

  # --- ARTIFACT MARKER -----------------------------------------------------------------
  # A feature-shaped diff almost always maps to a Linear ticket (referenced in the story
  # doc and/or recent commit messages). If any such ticket is found, require proof that a
  # visual Artifact was published and attached to it: a marker file at
  # .claude/local/artifacts/<TICKET-ID>.json (gitignored — .claude/local/ — so this is a
  # per-machine, per-session discipline check, not repo state).
  #
  # 2026-09-20: schema hardened (docs/stories/linear-worker-pipeline-hardening.md) beyond
  # "does the file exist" — it must also self-report a hoisting decision, the artifact's
  # section coverage, and a test coverage map. Same trust tier as the docs/stories check:
  # this verifies shape/presence, not content quality — no different than everything else
  # in this hook. What Claude is expected to do when this fires:
  #   1. Build a visual Artifact with three sections — "What changed" (condensed: masthead
  #      + status + at most 1-2 diagrams, not a wall of text — see artifact-design +
  #      artifact-diagramming skills), "Run it locally" (name the ".vscode/tasks.json"
  #      "Start NeoCRM Dev Stack" task), "Verify it" (a QA checklist mirroring the
  #      Acceptance Criteria 1:1).
  #   2. Publish it, then attach it to the ticket via save_issue's `links` param so it's
  #      visible ON the Linear issue itself.
  #   3. Write the marker: mkdir -p .claude/local/artifacts && write
  #      .claude/local/artifacts/<TICKET-ID>.json with:
  #      { "url": "<artifact url>",
  #        "hoisting": "platform" | "client:<slug>" | "n/a — infra/tooling",
  #        "sections": ["summary", "run-locally", "qa-checklist"],
  #        "testCoverageMap": [ { "ac": "<short AC text>", "tests": ["<file> › <test name>"] } ] }
  TICKET_REFS="$( { [ -n "$STORY_FILE" ] && cat $STORY_FILE 2>/dev/null; git log --format=%B -n 20 2>/dev/null; } \
    | grep -oE '\b[A-Z]{2,10}-[0-9]+\b' | sort -u || true)"
  if [ -n "$TICKET_REFS" ]; then
    while IFS= read -r ticket; do
      [ -z "$ticket" ] && continue
      MARKER=".claude/local/artifacts/${ticket}.json"
      if [ ! -f "$MARKER" ]; then
        FAILS+=("Diff references Linear ticket ${ticket} but no visual artifact has been attached to it yet (missing $MARKER). Publish an Artifact (What changed / Run it locally / Verify it), attach it to ${ticket} via save_issue's links param, and record the marker file before ending this turn.")
      else
        jq -e '.hoisting != null and .hoisting != ""' "$MARKER" >/dev/null 2>&1 \
          || FAILS+=("$MARKER exists but is missing a non-empty 'hoisting' field — state explicitly whether ${ticket} is platform-generic or tenant-specific (and whether it could be hoisted) before ending this turn.")
        jq -e '(.sections // []) | index("summary") != null and index("run-locally") != null and index("qa-checklist") != null' "$MARKER" >/dev/null 2>&1 \
          || FAILS+=("$MARKER exists but its 'sections' array doesn't cover all three required sections (summary, run-locally, qa-checklist) — the artifact for ${ticket} must have all three.")
        jq -e '(.testCoverageMap // []) | length > 0' "$MARKER" >/dev/null 2>&1 \
          || FAILS+=("$MARKER exists but 'testCoverageMap' is empty — map each Acceptance Criterion for ${ticket} to the test(s) that verify it before ending this turn.")
      fi
    done <<< "$TICKET_REFS"
  fi
fi

if [ "${#FAILS[@]}" -eq 0 ]; then
  exit 0
fi

jq -n --arg reason "$(printf '%s\n' "${FAILS[@]}" | sed 's/^/- /')" \
  '{continue: false, decision: "block", reason: ("Quality gate failed — fix before this turn can end:\n" + $reason)}'
exit 0
