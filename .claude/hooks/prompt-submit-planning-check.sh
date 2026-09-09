#!/usr/bin/env bash
# UserPromptSubmit hook: standing reminder to gate non-trivial work through
# /enrich-user-story and Plan mode BEFORE code changes start, not just check for it
# retroactively at Stop. A shell hook can't judge "is this request large" — that
# judgment stays with Claude; this hook's only job is to guarantee the question gets
# asked every single time, since skill auto-invocation is best-effort, not guaranteed.
set -uo pipefail

jq -n '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: "Standing pre-check (every prompt): if this request describes a new feature, a workflow change, or anything non-trivial (not a typo/small bugfix/pure question) — run /enrich-user-story first and save its output to docs/stories/ before writing code, and use Plan mode for anything touching more than 2-3 files or an architectural decision. Skip only for genuinely small, unambiguous requests."
  }
}'
