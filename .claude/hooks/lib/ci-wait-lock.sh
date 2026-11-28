#!/usr/bin/env bash
# Shared by quality-gate.sh and post-push.sh (CORE-247): is CI expected on this branch,
# and is a background ci-wait already waiting on this commit? ci-wait.mjs holds
# .claude/local/ci-wait/<sha>.pid while it runs; a gate that sees it lets the turn end
# instead of blocking again, because every block costs one more full-context turn.

# on_ci_branch <branch> → 0 when the branch matches .claude/ci-autofix.json ciBranchPatterns.
on_ci_branch() {
  local branch="$1" pattern
  # read, not a for-loop: the patterns contain '*' and must not glob against the tree.
  while IFS= read -r pattern; do
    # shellcheck disable=SC2254
    [ -n "$pattern" ] && case "$branch" in $pattern) return 0 ;; esac
  done < <(jq -r '.ciBranchPatterns[]' "${CI_AUTOFIX_FILE:-.claude/ci-autofix.json}" 2>/dev/null)
  return 1
}

# ci_wait_running <full sha> → 0 when a live ci-wait process holds the lock for that commit.
ci_wait_running() {
  local file="${CI_WAIT_DIR:-.claude/local/ci-wait}/$1.pid" pid
  [ -f "$file" ] || return 1
  pid="$(cat "$file" 2>/dev/null)"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}
