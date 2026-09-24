#!/usr/bin/env bash
# SessionStart hook: nudges when closed-looking worktrees have piled up (NEO-50).
# Never deletes anything and does no network I/O — it counts git-only candidates
# against the last-fetched origin/dev. The Linear "ticket is Done" check and the
# actual removal happen in /worktree-clean.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
SCRIPT="$ROOT/infrastructure/scripts/worktree-clean.sh"
[ -x "$SCRIPT" ] || exit 0

COUNT="$("$SCRIPT" --count 2>/dev/null | tail -1)"
case "$COUNT" in ''|*[!0-9]*) exit 0 ;; esac
[ "$COUNT" -gt 0 ] || exit 0

MSG="$COUNT worktree(s) look closed (merged into origin/dev, clean). Run /worktree-clean to review and remove them."
jq -n --arg msg "$MSG" '{
  systemMessage: $msg,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ($msg + " Mention this to Łukasz once, briefly, at a natural point — do not run the cleanup unless he asks.")
  }
}'
