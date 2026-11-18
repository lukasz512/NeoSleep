#!/usr/bin/env bash
# PostToolUse(Bash) hook (CORE-175, decision slim-r1 D5: 1 ticket = 1 session). After a
# successful `git push`, tell Claude the handover order: the handover the quality gate
# checks (full Artifact or a light board comment, per lib/change-shape.sh), then a
# handoff file, then one line suggesting /clear. Silent for anything else.
set -uo pipefail
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' || exit 0
printf '%s' "$CMD" | grep -qE -- '--dry-run|(^|[[:space:]])-n([[:space:]]|$)' && exit 0
ERR="$(printf '%s' "$INPUT" | jq -r '.tool_response.stderr // empty' 2>/dev/null)"
printf '%s' "$ERR" | grep -qE 'failed to push|\[rejected\]|fatal:' && exit 0

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/change-shape.sh
source "$DIR/lib/change-shape.sh"
BASE="$(git merge-base HEAD origin/dev 2>/dev/null || true)"
CHANGED=""
[ -n "$BASE" ] && CHANGED="$(git diff --name-only "$BASE" HEAD 2>/dev/null)"
if [ "$(change_shape "$CHANGED")" = full ]; then
  HANDOVER="full Artifact via /ship-artifact (UI/feature change: before/after, Change Index row)"
else
  HANDOVER="light handover in one command: node .claude/skills/ship-artifact/build.mjs light --title … --summary … --before … --after … (or --new … for a new element) --post — it posts the board comment (summary, before/after, PR link) and moves the ticket to Needs Review (a non-UI change gets no Artifact page)"
fi
# CORE-247: one background wait per push instead of a gate block per poll.
# shellcheck source=lib/ci-wait-lock.sh
source "$DIR/lib/ci-wait-lock.sh"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
SHA="$(git rev-parse HEAD 2>/dev/null || true)"
CI="check CI once a PR exists"
if [ -n "$SHA" ] && CI_AUTOFIX_FILE="${ROOT:-.}/.claude/ci-autofix.json" on_ci_branch "$BRANCH"; then
  CI="start the CI wait now, once, in the background (run_in_background): node infrastructure/scripts/ci-wait.mjs --branch ${BRANCH} --sha ${SHA} — you are re-invoked when it exits; never poll gh run / ci-status yourself and never start a second wait for the same commit"
fi
MSG="Pushed. Finish this ticket in this order, then stop: (0) ${CI}; (1) ${HANDOVER}; the PR link goes to Łukasz only once CI is green; (2) write the handoff to .claude/local/handoff/<ticket>.md (≤30 lines: ticket, branch, done, left, links); (3) end the final reply with one line for Łukasz: \"Ticket done → /clear; the next ticket starts in a new session from the handoff.\""
jq -n --arg ctx "$MSG" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
