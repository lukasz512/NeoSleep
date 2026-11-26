#!/usr/bin/env bash
# SessionStart hook: removes closed worktrees and merged branches automatically (NEO-84,
# Łukasz 2026-09-26: "auto for merged"). Runs `worktree-clean.sh --auto` in the
# background — fetch + removing node_modules-heavy worktrees can take longer than a hook
# may block — and reports the previous run's result. Only merged/commit-less branches go
# (see worktree-clean.sh); unmerged, dirty and locked (open Claude session) are kept.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
SCRIPT="$ROOT/infrastructure/scripts/worktree-clean.sh"
[ -x "$SCRIPT" ] || exit 0

# Shared by every worktree: the main checkout's .claude/local/.
COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
LOCAL_DIR="$(dirname "$COMMON")/.claude/local"
mkdir -p "$LOCAL_DIR" || exit 0
LOG="$LOCAL_DIR/worktree-clean.log"
LOCK="$LOCAL_DIR/worktree-clean.lock"

LAST=""
[ -f "$LOG" ] && LAST="$(grep '^auto:' "$LOG" | tail -1)"

# One run at a time across sessions; a lock older than 30 min is a crashed run.
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; fi
if mkdir "$LOCK" 2>/dev/null; then
  ( cd "$ROOT" && { date '+%F %T'; "$SCRIPT" --auto; } > "$LOG" 2>&1; rmdir "$LOCK" ) </dev/null >/dev/null 2>&1 &
  disown 2>/dev/null || true
fi

[ -n "$LAST" ] || exit 0
MSG="Worktree cleanup (last run) — ${LAST#auto: }. Log: .claude/local/worktree-clean.log"
jq -n --arg msg "$MSG" '{
  systemMessage: $msg,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ($msg + " Cleanup runs automatically at every session start; do not mention it unless Łukasz asks or something was kept that he must decide on.")
  }
}'
