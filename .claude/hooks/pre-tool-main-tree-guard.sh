#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|NotebookEdit): blocks file edits in the MAIN working tree.
#
# Standing decision (Łukasz, 2026-09-24): every thread works in its own git worktree under
# .claude/worktrees/, so concurrent Claude sessions never edit the same checkout. The
# SessionStart hook tells Claude to call EnterWorktree up front; this is the enforcement
# half, so a forgotten EnterWorktree fails on the first edit instead of silently landing
# changes on the shared checkout.
#
# Only paths inside the main checkout are blocked. Still allowed:
#   - anything under .claude/worktrees/ (the worktrees themselves)
#   - .claude/local/ (gitignored per-machine state, e.g. artifact markers)
#   - anything outside the repo (Claude memory dir, scratchpad, /tmp)
# Bash-driven edits (sed, heredocs) are not intercepted — this is a guard rail, not a
# sandbox.
set -uo pipefail

INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"
[ -z "$FILE_PATH" ] && exit 0

COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
MAIN_ROOT="$(dirname "$COMMON_DIR")"

case "$FILE_PATH" in
  "$MAIN_ROOT"/.claude/worktrees/*|"$MAIN_ROOT"/.claude/local/*) exit 0 ;;
  "$MAIN_ROOT"/*) ;;
  *) exit 0 ;;
esac

jq -n --arg p "$FILE_PATH" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("Blocked: " + $p + " is in the MAIN working tree. Standing decision (2026-09-24): every thread works in its own worktree. Call EnterWorktree first (name \"<ticket-id>-<kebab-slug>\", or \"<kebab-slug>\" without a ticket), then make this edit inside it.")
  }
}'
