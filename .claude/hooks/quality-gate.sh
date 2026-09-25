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
# 2026-09-20 (same day, NEO-9): the marker's presence didn't guarantee the artifact actually
# showed the change — NEO-9's first artifact had three text sections but no before/after
# visual, which is exactly the "AI slop" the check above was meant to stop. Two fixes: (1)
# VISUAL_SHAPE below widens the trigger beyond FEATURE_SHAPE's views/routes/migrations-only
# regex — a layout/component-only Vue diff (no new view or route) previously skipped the
# artifact gate entirely, which is how NEO-9 (a layouts/ + packages/ui/ change) slipped
# through the first time; (2) the marker now also requires a non-empty `visualComparison`
# field whenever Vue/style files changed, so "I wrote three sections" no longer satisfies
# the gate without an actual before/after shown somewhere.
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

# --- Branch-level view ------------------------------------------------------------------
# 2026-09-24: "every change ships with an Artifact, always" (Łukasz). The checks below this
# block only ever looked at UNCOMMITTED changes, so committing before the turn ended skipped
# the artifact requirement entirely (it happened on the app-shell inset-card change that
# prompted this). BRANCH_CHANGED is everything this branch changed vs. its fork point from
# origin/dev, committed or not — the artifact check runs on that, not just on git status.
# lint/typecheck/test stay scoped to uncommitted src changes (pre-commit/pre-push cover the
# committed part, and re-running the suite on every Stop would be too slow).
BASE="$(git merge-base HEAD origin/dev 2>/dev/null || true)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
BRANCH_CHANGED=""
if [ -n "$BASE" ]; then
  BRANCH_CHANGED="$( { git diff --name-only "$BASE" HEAD 2>/dev/null; git status --porcelain 2>/dev/null | awk '{ $1=""; print substr($0,2) }'; } | grep -v '^$' | sort -u || true)"
fi

FAILS=()
WARNS=()

# Every branch with any change needs a published Artifact recorded in a marker — ticket or
# no ticket. A ticket-named branch (worktree-neo-123-…, worker/neo-123-…) is satisfied by
# that ticket's own marker (full schema, checked further down when src changed); any other
# branch needs .claude/local/artifacts/branch-<branch>.json with at least:
#   { "url": "<artifact url>", "sections": ["summary","run-locally","qa-checklist"],
#     "visualComparison": "<required when any .vue/.css changed: real before/after
#       screenshots, or a labeled mockup when no live render was possible>" }
# The artifact must also be shown to Łukasz in the reply (link), not just recorded.
branch_artifact_check() {
  [ -z "$BRANCH_CHANGED" ] && return 0
  local ticket marker visual
  ticket="$(printf '%s' "$BRANCH" | grep -oiE '[a-z]{2,10}-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' || true)"
  if [ -n "$ticket" ] && [ -f ".claude/local/artifacts/${ticket}.json" ]; then
    marker=".claude/local/artifacts/${ticket}.json"
  else
    marker=".claude/local/artifacts/branch-$(printf '%s' "$BRANCH" | tr '/' '-').json"
  fi
  if [ ! -f "$marker" ]; then
    FAILS+=("Branch '${BRANCH}' has changes ($(printf '%s' "$BRANCH_CHANGED" | wc -l | tr -d ' ') file(s) vs origin/dev) but no Artifact marker ($marker). Standing rule: every change ships with a published Artifact — build it (What changed / Run it locally / Verify it, plus a real before/after for UI changes), publish it, give Łukasz the link, then write the marker.")
    return 0
  fi
  jq -e '.url != null and .url != ""' "$marker" >/dev/null 2>&1 \
    || FAILS+=("$marker has no non-empty 'url' — record the published Artifact's link.")
  jq -e '(.sections // []) | index("summary") != null and index("run-locally") != null and index("qa-checklist") != null' "$marker" >/dev/null 2>&1 \
    || FAILS+=("$marker 'sections' must cover summary, run-locally and qa-checklist.")
  # Once the branch is pushed, the Artifact must carry a "Create PR" button at the top
  # (Łukasz, 2026-09-24: "niech pr przycisk będzie na górze artefaktu") — the pre-filled
  # compare URL from CLAUDE.md's Linear traceability section. He still clicks Create himself.
  # Once he has opened the PR, ship-artifact's build.mjs links the button to it instead
  # (…/pull/<n>) — accept that too, or every refresh after the PR exists would be blocked.
  if git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    jq -e '(.prUrl // "") | test("^https://github.com/.+/(compare/|pull/[0-9]+$)")' "$marker" >/dev/null 2>&1 \
      || FAILS+=("$marker has no 'prUrl' but '${BRANCH}' is pushed — put a 'Create PR' button (pre-filled https://github.com/<org>/<repo>/compare/dev...<branch>?quick_pull=1&title=…&body=… URL) at the TOP of the Artifact, republish, and record it as 'prUrl'.")
  fi
  visual="$(printf '%s\n' "$BRANCH_CHANGED" | grep -E '\.(vue|css|scss)$' || true)"
  if [ -n "$visual" ]; then
    jq -e '.visualComparison != null and .visualComparison != ""' "$marker" >/dev/null 2>&1 \
      || FAILS+=("$marker has no 'visualComparison' but this branch changes UI files ($(printf '%s' "$visual" | tr '\n' ' ')) — the Artifact must show a real before/after.")
  fi
  # 2026-09-25 (Łukasz, NEO-47/48): the Artifact is the one deliverable, and it has to be
  # ON the ticket, not only in chat — "zawsze ma byc po sesji w tasku albo tutaj". A ticket
  # branch needs it attached (save_issue links) and commented (save_comment). The
  # ship-artifact skill does both and records them via `build.mjs finalize`.
  if [ -n "$ticket" ] && [ "$marker" = ".claude/local/artifacts/${ticket}.json" ]; then
    jq -e '.linearAttached == true and .linearCommented == true' "$marker" >/dev/null 2>&1 \
      || FAILS+=("$marker: the Artifact isn't attached to and commented on ${ticket} yet. Attach it (save_issue links), post the summary comment (save_comment), then record both — see .claude/skills/ship-artifact/SKILL.md Steps 4-5.")
  fi
  dev_mergeable_check
}

# 2026-09-25 (Łukasz, NEO-57): a "Create PR" link is only useful if GitHub can actually
# merge it — he hit a PR that couldn't merge into dev because dev had moved on (NEO-56 /
# NEO-61 landed underneath). Once the branch is pushed, fetch the latest dev and do a
# trial merge IN MEMORY (git merge-tree --write-tree: no checkout, no index, no files
# touched). Conflicts block the turn, so the Artifact link is never handed over for a
# branch that can't merge. Needs git >= 2.38; an unreachable remote only warns, never
# blocks (offline shouldn't strand the turn).
dev_mergeable_check() {
  git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1 || return 0
  # macOS has no `timeout`; bound the fetch via ssh's own connect timeout instead.
  if ! GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -o ConnectTimeout=10 -o BatchMode=yes" git fetch --quiet origin dev 2>/dev/null; then
    WARNS+=("Couldn't fetch origin/dev to check that '${BRANCH}' still merges cleanly — check before handing over the PR link.")
    return 0
  fi
  local out conflicts
  if ! out="$(git merge-tree --write-tree --name-only origin/dev HEAD 2>/dev/null)"; then
    # First line is the tree id; the conflicted paths follow until the first blank line.
    conflicts="$(printf '%s\n' "$out" | sed -n '2,/^$/p' | grep -v '^$' | sort -u | tr '\n' ' ')"
    FAILS+=("Branch '${BRANCH}' does NOT merge cleanly into origin/dev — the PR link would be unmergeable. Conflicts in: ${conflicts:-(see git merge-tree)}. Merge origin/dev into the branch, resolve, re-run tests, push, refresh the Artifact, and only then give Łukasz the link.")
  fi
}

# 2026-09-25 (Łukasz, NEO-57): "after merge, test it on pwa-dev too". Once everything this
# branch shipped is in origin/dev (the PR was merged), the turn can't end until the deployed
# pwa-dev has been checked and the result recorded in the branch's Artifact marker as
#   "devVerified": { "sha": "<HEAD sha>", "ok": true, "at": "<ISO time>", "summary": "..." }
# Checking means: the "Deploy NeoSleepCare App" run on dev for a commit containing HEAD
# finished green (gh run list --workflow deploy-pwa.yml --branch dev), then
# infrastructure/scripts/smoke-dev-bundle.mjs finds the change's markers in the deployed
# bundle (marker file "smokeMarkers": [{label,text}]), plus a logged-in click-through when a
# QA account is configured. Runs outside branch_artifact_check on purpose: after a merge the
# branch has no diff vs origin/dev, so that check exits early.
dev_deploy_check() {
  local ticket marker head
  ticket="$(printf '%s' "$BRANCH" | grep -oiE '[a-z]{2,10}-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' || true)"
  if [ -n "$ticket" ] && [ -f ".claude/local/artifacts/${ticket}.json" ]; then
    marker=".claude/local/artifacts/${ticket}.json"
  else
    marker=".claude/local/artifacts/branch-$(printf '%s' "$BRANCH" | tr '/' '-').json"
  fi
  # Only for work that was actually shipped: a marker with a PR link.
  [ -f "$marker" ] || return 0
  jq -e '(.prUrl // "") != ""' "$marker" >/dev/null 2>&1 || return 0
  GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -o ConnectTimeout=10 -o BatchMode=yes" git fetch --quiet origin dev 2>/dev/null || return 0
  head="$(git rev-parse HEAD 2>/dev/null)" || return 0
  git merge-base --is-ancestor "$head" origin/dev 2>/dev/null || return 0
  if ! jq -e --arg sha "$head" '.devVerified.sha == $sha and .devVerified.ok == true' "$marker" >/dev/null 2>&1; then
    FAILS+=("'${BRANCH}' is merged into dev (HEAD ${head:0:7} is in origin/dev) but not verified on pwa-dev yet. Wait for the dev 'Deploy NeoSleepCare App' run containing it to finish green (gh run list --workflow deploy-pwa.yml --branch dev), run node infrastructure/scripts/smoke-dev-bundle.mjs --markers <this change's markers> (store them as 'smokeMarkers' in $marker), then node infrastructure/scripts/smoke-dev-ui.mjs --check '<route>=<selector>' ... (logged-in click-through with the QA account in .claude/local/qa-dev.json; skip only if that file doesn't exist and say so), then record devVerified {sha, ok, at, summary} in $marker and tell Łukasz the result.")
  fi
}

emit_result() {
  dev_deploy_check
  if [ "${#FAILS[@]}" -eq 0 ]; then
    if [ "${#WARNS[@]}" -gt 0 ]; then
      jq -n --arg msg "$(printf '%s\n' "${WARNS[@]}" | sed 's/^/- /')" '{systemMessage: ("Quality gate warnings:\n" + $msg)}'
    fi
    exit 0
  fi
  jq -n --arg reason "$(printf '%s\n' "${FAILS[@]}" | sed 's/^/- /')" \
    '{continue: false, decision: "block", reason: ("Quality gate failed — fix before this turn can end:\n" + $reason)}'
  exit 0
}

if [ -z "$SRC_CHANGED" ]; then
  branch_artifact_check
  emit_result
fi
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
  AFFECTED_DIRS="$(printf '%s\n' "$SRC_CHANGED" | "$REPO_ROOT/infrastructure/scripts/affected-workspaces.sh")"
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
fi

# Any Vue/style change — not just FEATURE_SHAPE's views/routes/migrations regex. A
# layout/component-only diff (e.g. apps/*/src/layouts/, packages/*/src/components/) is
# exactly as "visual" as a new view, but FEATURE_SHAPE alone missed it (confirmed gap:
# NEO-9 touched only layouts/ + packages/ui/, so the artifact gate below never fired on
# the first pass of that ticket). This variable exists purely to decide whether a
# before/after visual comparison should be required in the artifact marker below — it does
# NOT require a docs/stories entry the way FEATURE_SHAPE does.
VISUAL_SHAPE="$(printf '%s\n' "$SRC_CHANGED" | grep -E '\.(vue|css)$' || true)"

if [ -n "$FEATURE_SHAPE" ] || [ -n "$VISUAL_SHAPE" ]; then
  # --- ARTIFACT MARKER -----------------------------------------------------------------
  # A feature- or visual-shaped diff almost always maps to a Linear ticket (referenced in
  # the story doc and/or recent commit messages). If any such ticket is found, require
  # proof that a visual Artifact was published and attached to it: a marker file at
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
  #   2. When VISUAL_SHAPE is non-empty (any .vue/.css file changed): "What changed" must
  #      also show an actual before/after — either the two PNGs from Step 9's screenshot
  #      convention (docs/worker-screenshots/<ticket>/{before,after}.png) if a real render
  #      was possible, or, when no live-app/DB access was available, a hand-built HTML/CSS
  #      mockup reproducing the real component's colors/spacing/layout, clearly labeled as
  #      a mockup rather than a live screenshot. A wall of prose describing the change is
  #      not a substitute — this is the exact "AI slop" gap that prompted this check.
  #   3. Publish it, then attach it to the ticket via save_issue's `links` param so it's
  #      visible ON the Linear issue itself.
  #   4. Write the marker: mkdir -p .claude/local/artifacts && write
  #      .claude/local/artifacts/<TICKET-ID>.json with:
  #      { "url": "<artifact url>",
  #        "hoisting": "platform" | "client:<slug>" | "n/a — infra/tooling",
  #        "sections": ["summary", "run-locally", "qa-checklist"],
  #        "testCoverageMap": [ { "ac": "<short AC text>", "tests": ["<file> › <test name>"] } ],
  #        "visualComparison": "<omit entirely when VISUAL_SHAPE is empty; otherwise a short
  #          description of what before/after evidence exists and where, e.g. 'mockup
  #          embedded in artifact What changed section' or 'docs/worker-screenshots/NEO-9/
  #          before.png + after.png'>" }
  # Commit messages from THIS branch only (BASE..HEAD). The old `git log -n 20` also swept
  # in tickets from already-merged dev commits, so a fresh worktree off dev demanded
  # artifacts for other people's finished tickets (NEO-17 etc.) on its first src edit.
  if [ -n "$BASE" ]; then LOG_RANGE="$BASE..HEAD"; else LOG_RANGE="-n 20"; fi
  # shellcheck disable=SC2086 # LOG_RANGE is intentionally word-split in the fallback case
  TICKET_REFS="$( { [ -n "${STORY_FILE:-}" ] && cat $STORY_FILE 2>/dev/null; git log --format=%B $LOG_RANGE 2>/dev/null; } \
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
        if [ -n "$VISUAL_SHAPE" ]; then
          jq -e '.visualComparison != null and .visualComparison != ""' "$MARKER" >/dev/null 2>&1 \
            || FAILS+=("$MARKER exists but this diff changes Vue/CSS files ($(printf '%s' "$VISUAL_SHAPE" | tr '\n' ' ')) and the marker has no non-empty 'visualComparison' field — the artifact for ${ticket} must show an actual before/after (real screenshots or a labeled mockup), not just text sections.")
        fi
      fi
    done <<< "$TICKET_REFS"
  fi
fi

branch_artifact_check
emit_result
