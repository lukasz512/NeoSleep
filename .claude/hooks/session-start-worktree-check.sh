#!/usr/bin/env bash
# SessionStart hook: reminds Claude to ask whether this thread should run in its own
# git worktree, isolated from other concurrent sessions, per Łukasz's standing instruction
# (2026-09) that new threads should default to being asked this question up front.
set -uo pipefail

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || exit 0

if printf '%s' "$GIT_DIR" | grep -q '/worktrees/'; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "This session is running in the MAIN working tree, not an isolated worktree. Standing instruction: near the start of this conversation, ask Łukasz whether this thread should run in its own git worktree instead (isolates this session'"'"'s file changes from other concurrent Claude Code sessions on the same repo, avoids merge conflicts between them). Ask before making file edits, not after."
  }
}'
