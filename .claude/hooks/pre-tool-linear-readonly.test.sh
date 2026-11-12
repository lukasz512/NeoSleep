#!/usr/bin/env bash
# Self-test for pre-tool-linear-readonly.sh. Usage: bash .claude/hooks/pre-tool-linear-readonly.test.sh
set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-tool-linear-readonly.sh"
FAILS=0

decision() {  # decision <tool name> → "deny" or "allow"
  local out
  out="$(jq -n --arg t "$1" '{tool_name: $t, tool_input: {}}' | bash "$HOOK")"
  [ -n "$out" ] && printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision' || echo allow
}
reason() {
  jq -n --arg t "$1" '{tool_name: $t, tool_input: {}}' | bash "$HOOK" | jq -r '.hookSpecificOutput.permissionDecisionReason'
}
check() {  # check <description> <expected> <tool name>
  local got; got="$(decision "$3")"
  if [ "$got" = "$2" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got $got)"; FAILS=$((FAILS + 1)); fi
}

check "creating or updating an issue is denied"   deny  mcp__claude_ai_Linear__save_issue
check "commenting is denied"                      deny  mcp__claude_ai_Linear__save_comment
check "attaching an artifact is denied"           deny  mcp__claude_ai_Linear__create_attachment
check "deleting is denied"                        deny  mcp__claude_ai_Linear__delete_comment
check "reading an issue is allowed"               allow mcp__claude_ai_Linear__get_issue
check "listing issues is allowed"                 allow mcp__claude_ai_Linear__list_issues
check "searching docs is allowed"                 allow mcp__claude_ai_Linear__search_documentation

if reason mcp__claude_ai_Linear__save_comment | grep -q "pnpm board comment"; then echo "  ok   the denial names the board command"
else echo "  FAIL the denial names the board command"; FAILS=$((FAILS + 1)); fi

[ "$FAILS" -eq 0 ] && echo "all checks passed" || { echo "$FAILS check(s) failed"; exit 1; }
