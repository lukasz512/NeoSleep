#!/usr/bin/env bash
# Self-test for pre-tool-linear-ticket-format.sh. Usage: bash .claude/hooks/pre-tool-linear-ticket-format.test.sh
set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-tool-linear-ticket-format.sh"
FAILS=0

decision() {  # decision <tool_input json> → "deny" or "allow"
  local out
  out="$(jq -n --argjson ti "$1" '{tool_name: "mcp__claude_ai_Linear__save_issue", tool_input: $ti}' | bash "$HOOK")"
  [ -n "$out" ] && printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision' || echo allow
}
check() {  # check <description> <expected> <tool_input json>
  local got; got="$(decision "$3")"
  if [ "$got" = "$2" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got $got)"; FAILS=$((FAILS + 1)); fi
}

GOOD='## Problem\nVideos fail on pwa-dev.\n\n## Change\n- Serve 8 MiB slices\n\n## Done when\n- A webinar plays and seeks on pwa-dev'
LONG="$(printf '## Problem\n%01600d\n## Change\n- x\n## Done when\n- y' 0)"

check "template ticket is allowed"                allow "$(jq -n --arg d "$(printf "$GOOD")" '{team: "NeoSleep", title: "t", description: $d}')"
check "missing 'Done when' is denied"             deny  "$(jq -n '{team: "NeoSleep", title: "t", description: "## Problem\nx\n\n## Change\n- y"}')"
check "free-form essay is denied"                 deny  "$(jq -n '{team: "NeoSleep", title: "t", description: "Some background and options."}')"
check "empty description is denied"               deny  "$(jq -n '{team: "NeoSleep", title: "t"}')"
check "over 1500 characters is denied"            deny  "$(jq -n --arg d "$LONG" '{team: "NeoSleep", title: "t", description: $d}')"
check "update of an existing ticket is not checked" allow "$(jq -n '{id: "NEO-1", state: "Done"}')"

[ "$FAILS" -eq 0 ] && echo "all checks passed" || { echo "$FAILS check(s) failed"; exit 1; }
