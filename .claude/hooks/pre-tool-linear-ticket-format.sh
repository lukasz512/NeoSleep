#!/usr/bin/env bash
# PreToolUse hook (matcher mcp__claude_ai_Linear__save_issue): a NEW Linear ticket must be
# short and only about its change (NEO-84, Łukasz 2026-09-26: "zadania w linear maja byc
# mocno w punkt i bardzo o swojej zmianie"). Template, in this order:
#   ## Problem     — 1-3 sentences: what is wrong or missing
#   ## Change      — bullets: what this ticket changes, nothing else
#   ## Done when   — bullets: checkable acceptance criteria
# Max 1500 characters. Updates (an `id` is passed) are not checked: status moves, links
# and comments on older tickets must keep working.
set -uo pipefail

INPUT="$(cat)"
[ "$(printf '%s' "$INPUT" | jq -r '.tool_input.id // empty')" = "" ] || exit 0
DESC="$(printf '%s' "$INPUT" | jq -r '.tool_input.description // empty')"
TEMPLATE="$(printf '%s' "$INPUT" | jq -r '.tool_input.template // empty')"
[ -n "$TEMPLATE" ] && [ -z "$DESC" ] && exit 0

PROBLEMS=()
[ -z "$DESC" ] && PROBLEMS+=("the description is empty")
for h in "## Problem" "## Change" "## Done when"; do
  printf '%s\n' "$DESC" | grep -qx "$h" || PROBLEMS+=("missing the '$h' heading")
done
LEN="$(printf '%s' "$DESC" | wc -m | tr -d ' ')"
[ "$LEN" -gt 1500 ] && PROBLEMS+=("it is $LEN characters (max 1500)")

[ "${#PROBLEMS[@]}" -eq 0 ] && exit 0

REASON="New Linear ticket rejected (NEO-84 format): $(IFS=';'; printf '%s' "${PROBLEMS[*]}" | sed 's/;/; /g'). Rewrite it as '## Problem' (1-3 sentences), '## Change' (bullets, only this change), '## Done when' (checkable bullets), max 1500 characters — no background essays, no options survey; those belong in docs/stories/ or the Artifact."
jq -n --arg r "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
