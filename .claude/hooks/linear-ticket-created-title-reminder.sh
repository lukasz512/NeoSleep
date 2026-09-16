#!/usr/bin/env bash
# PostToolUse hook for mcp__claude_ai_Linear__save_issue.
# When a NEW Linear ticket is created (no tool_input.id, i.e. not an update),
# surface its identifier so the session title / branch / PR can lead with it,
# per CLAUDE.md's "Linear traceability" section.
set -euo pipefail

input=$(cat)

is_create=$(echo "$input" | jq -r 'if .tool_input.id == null then "1" else "" end')
[ -n "$is_create" ] || exit 0

tid=$(echo "$input" | jq -r '.tool_response | .. | strings' 2>/dev/null | grep -oE '^[A-Z]{2,10}-[0-9]+$' | head -1)
[ -n "$tid" ] || exit 0

jq -n --arg tid "$tid" '{
  systemMessage: ("New Linear ticket " + $tid + " created — run /rename so the session tab title leads with [" + $tid + "]."),
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("A new Linear ticket " + $tid + " was just created via save_issue. Tell the user now to run /rename so this session/tab title leads with [" + $tid + "], and prefix your own next reply with [" + $tid + "].")
  }
}'
