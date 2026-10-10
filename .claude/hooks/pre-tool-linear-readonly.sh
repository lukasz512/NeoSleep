#!/usr/bin/env bash
# PreToolUse hook (matcher mcp__claude_ai_Linear__.*): Linear is read-only since CORE-187.
# The work board is the one source of truth (decision D2, core187-r1 Q3): sessions create,
# comment on and hand over tickets with `pnpm board …` (infrastructure/scripts/board.mjs).
# Reading Linear (get_*, list_*, search_*, extract_*) stays allowed for the 30-day archive
# window; every write is denied with a pointer to the board command that replaces it.
set -uo pipefail

TOOL="$(jq -r '.tool_name // empty')"
ACTION="${TOOL#mcp__claude_ai_Linear__}"
case "$ACTION" in
  get_*|list_*|search_*|extract_*) exit 0 ;;
esac

case "$ACTION" in
  save_issue)   HINT="pnpm board create --team CORE --title \"…\" --body \"## Problem…## Change…## Done when…\" (new ticket) or pnpm board move/branch/link <KEY> … (update)" ;;
  save_comment) HINT="pnpm board comment <KEY> \"text\"" ;;
  create_attachment*|prepare_attachment_upload) HINT="pnpm board link <KEY> --kind artifact|pr|ci --url https://…" ;;
  *)            HINT="pnpm board … (infrastructure/scripts/board.mjs)" ;;
esac

REASON="Linear is read-only since CORE-187: tickets live on the work board (/platform/board). Use $HINT instead of $TOOL."
jq -n --arg r "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
