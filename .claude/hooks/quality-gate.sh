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
# stack traces when Docker isn't up.
if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  exec 3>&- 3<&-
  run_check "test" pnpm -r test
else
  FAILS+=("Postgres is not reachable on 127.0.0.1:5432 — start it first (pnpm start, or docker compose up -d postgres) before tests can run.")
fi

run_check "depcruise" pnpm depcruise

DOCS_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^docs/' || true)"
if [ -z "$DOCS_CHANGED" ]; then
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

if [ "${#FAILS[@]}" -eq 0 ]; then
  exit 0
fi

jq -n --arg reason "$(printf '%s\n' "${FAILS[@]}" | sed 's/^/- /')" \
  '{continue: false, decision: "block", reason: ("Quality gate failed — fix before this turn can end:\n" + $reason)}'
exit 0
