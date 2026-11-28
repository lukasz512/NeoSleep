#!/usr/bin/env bash
# SessionStart hook (CORE-103, 2026-10-03), one short line at most:
# - handoff files written by context-guard.sh in the last 7 days, so a fresh session can
#   start from a 40-line file instead of a 150k-token history;
# - when more than 5 tickets have waited for Łukasz's review for over 7 days, one line that says so,
#   so he hears it before the session creates a new ticket (CORE-233; the rule is in board.mjs);
# - once every 30 days, a nudge to run /skill-auditor (packaging check) (the skill-description budget is
#   loaded into every session, so it must not quietly grow again).
# Read-only towards other sessions: it lists, never deletes.
set -uo pipefail

COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
LOCAL_DIR="$(dirname "$COMMON")/.claude/local"
STATE_DIR="$LOCAL_DIR/hook-state"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

LINES=()
# A worktree session can only write its own .claude/local/, so look in every worktree too.
MAIN="$(dirname "$COMMON")"
HANDOFFS="$(find "$LOCAL_DIR/handoff" "$MAIN"/.claude/worktrees/*/.claude/local/handoff -name '*.md' -mtime -7 2>/dev/null \
  | sed "s|^$MAIN/||" | sort | tr '\n' ' ')"
[ -n "$HANDOFFS" ] && LINES+=("Handoff files (last 7 days): ${HANDOFFS}— if this session continues one of them, read that file instead of re-exploring.")

# The board token lives in the main checkout; a fresh worktree has no .claude/local/ of its own.
BOARD_CONFIG="$LOCAL_DIR/board.json"
if [ -f "$BOARD_CONFIG" ]; then
  REVIEW="$(BOARD_API_URL="$(jq -r '.apiUrl // empty' "$BOARD_CONFIG")" BOARD_TOKEN="$(jq -r '.token // empty' "$BOARD_CONFIG")" \
    node "$(dirname "$0")/../../infrastructure/scripts/board.mjs" waiting --remind 2>/dev/null)"
  [ -n "$REVIEW" ] && LINES+=("$REVIEW")
  # Monday picks while Approved runs low (CORE-234).
  PICKS="$(BOARD_API_URL="$(jq -r '.apiUrl // empty' "$BOARD_CONFIG")" BOARD_TOKEN="$(jq -r '.token // empty' "$BOARD_CONFIG")" \
    node "$(dirname "$0")/../../infrastructure/scripts/board.mjs" picks --remind 2>/dev/null)"
  [ -n "$PICKS" ] && LINES+=("$PICKS")
fi

STAMP="$STATE_DIR/skill-doctor.last"
if [ -z "$(find "$STAMP" -mtime -30 2>/dev/null)" ]; then
  touch "$STAMP"
  LINES+=("Monthly check due: tell Łukasz in one line that /skill-auditor (packaging check) is due (skill descriptions load into every session; report budget, prune if over).")
fi

[ "${#LINES[@]}" -gt 0 ] || exit 0
jq -n --arg ctx "$(printf '%s ' "${LINES[@]}")" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
