#!/usr/bin/env bash
# SessionStart hook: every new thread runs in its own git worktree — no asking.
#
# History: until 2026-09-24 this only reminded Claude to *ask* Łukasz whether the thread
# should get a worktree. He answered "yes" every time and then made it a standing decision
# ("zawsze nowy thread idzie do nowego worktree"), so the question is gone. The rule is
# also enforced, not just reminded: pre-tool-main-tree-guard.sh blocks Edit/Write on files
# in the main working tree, so skipping this step fails loudly on the first edit.
set -uo pipefail

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || exit 0

if printf '%s' "$GIT_DIR" | grep -q '/worktrees/'; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "This session is running in the MAIN working tree. Standing decision (Łukasz, 2026-09-24): every new thread runs in its own git worktree — do NOT ask. Before the first file edit of any task that changes files, call EnterWorktree with name \"<ticket-id>-<kebab-slug>\" when a Linear ticket exists (e.g. neo-123-territory-admin-crud), otherwise \"<kebab-slug>\" describing the task. Pure questions/research with no file edits need no worktree. Edit/Write on main-tree files is blocked by pre-tool-main-tree-guard.sh."
  }
}'
