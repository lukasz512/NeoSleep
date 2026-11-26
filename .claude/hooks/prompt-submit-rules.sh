#!/usr/bin/env bash
# UserPromptSubmit hook: Łukasz's standing rules (planning gate, short replies, decision
# form). Replaces the three per-prompt hooks that re-injected ~650 tokens into EVERY
# prompt (CORE-103, 2026-10-03). The full rules go in on a session's first prompt (and
# again after /compact or /clear, which drop them); every 10th prompt gets a 1-line
# reminder; the other prompts inject nothing.
#
# Why prompt-time and not a Stop hook: a Stop hook can't edit a reply already shown,
# so blocking only adds a second message under the long one.
#
# `--reset` (SessionStart matcher compact|clear) forgets the session's counter.
set -uo pipefail

INPUT="$(cat)"
SID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"

STATE_DIR="${CLAUDE_HOOK_STATE_DIR:-}"
if [ -z "$STATE_DIR" ]; then
  COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && STATE_DIR="$(dirname "$COMMON")/.claude/local/hook-state"
fi
COUNT_FILE=""
if [ -n "$SID" ] && [ -n "$STATE_DIR" ] && mkdir -p "$STATE_DIR" 2>/dev/null; then
  COUNT_FILE="$STATE_DIR/rules-$SID.count"
  # Counters of sessions untouched for a week are dead weight.
  find "$STATE_DIR" -name 'rules-*.count' -mtime +7 -delete 2>/dev/null
fi

if [ "${1:-}" = "--reset" ]; then
  [ -n "$COUNT_FILE" ] && rm -f "$COUNT_FILE"
  exit 0
fi

N=1
if [ -n "$COUNT_FILE" ]; then
  [ -f "$COUNT_FILE" ] && N=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
  printf '%s' "$N" > "$COUNT_FILE"
fi

FULL='Standing rules for this session (Łukasz; injected once, they hold for every turn):
1. Planning gate: a new feature, workflow change or anything non-trivial (not a typo/small bugfix/pure question) → run /enrich-user-story first and save it to docs/stories/; use Plan mode for >2-3 files or an architectural decision.
2. Short replies (2026-09-25): the FINAL message is only what needs his attention: the outcome in ≤2 sentences + any decision, risk, failed/skipped step or link (artifact/PR) he must act on. No test counts, file lists or process narration; that goes in the Artifact, which opens with a 2-sentence summary and a "Needs your decision" box (omitted when empty). Never drop a decision or a failure.
3. Questions (NEO-88 + CORE-44): TDD first. What a test can settle (behavior, edge cases, validation, defaults, UI states) is not asked: pick the default, write the failing test, list it under `defaults` [{text, test}]. Ask only product/business/legal/priority choices, max 5 per round, each as 3 buttons in order yes · no · more (expanded variant with `expert` + one-line `detail`), exactly one `recommended`, in an Artifact (`decisions` in /ship-artifact, or /decision-form when nothing ships yet), published with capabilities {"comments": {}} and watched; reply = link + one line. Answers arrive as an artifact comment starting with [decision-form]. Never a question list in chat; one trivial yes/no may be asked inline.'
REMINDER='Reminder: the standing rules from this session'"'"'s first prompt still apply (planning gate, ≤2-sentence final reply, questions only as a 3-button decision form).'

if [ "$N" -eq 1 ]; then CTX="$FULL"
elif [ $(( N % 10 )) -eq 0 ]; then CTX="$REMINDER"
else exit 0
fi

jq -n --arg ctx "$CTX" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
