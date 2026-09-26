#!/usr/bin/env bash
# UserPromptSubmit hook: questions for Łukasz arrive as a form, not a chat list
# (Łukasz, 2026-09-26, NEO-88). The form's "Send to Claude" posts his answers as an
# artifact comment that wakes this session, so the thread continues in VS Code.
#
# Prompt-time for the same reason as prompt-submit-reply-brevity.sh: once a
# question list has been shown, a Stop hook can only add noise under it.
set -uo pipefail

jq -n '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: "Decision-form rule (Łukasz 2026-09-26, NEO-88): when you have 2 or more questions or decisions for Łukasz (scoping, open questions, choosing a variant), do NOT list them in chat. Build them with the /decision-form skill (options per question, recommendation marked, notes field, Send to Claude button), publish with capabilities {\"comments\": {}}, make sure this session watches the artifact, and reply with the link + one line. His answers arrive as an artifact comment starting with [decision-form]. A single yes/no question may still be asked inline."
  }
}'
