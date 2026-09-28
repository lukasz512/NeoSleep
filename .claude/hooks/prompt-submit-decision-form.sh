#!/usr/bin/env bash
# UserPromptSubmit hook: questions for Łukasz / neoCRM staff arrive as 3-button
# decisions inside an Artifact, not as a chat list (NEO-88, reshaped by CORE-44 on
# 2026-09-28). "Send to Claude" posts the answers as an artifact comment that wakes
# this session. Also carries his TDD-first rule: too many questions was the complaint —
# what a test will settle gets decided by default and proven by the test, not asked.
#
# Prompt-time for the same reason as prompt-submit-reply-brevity.sh: once a
# question list has been shown, a Stop hook can only add noise under it.
set -uo pipefail

jq -n '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: "Decision rule (Łukasz, NEO-88 + CORE-44 2026-09-28). TDD FIRST, FEW QUESTIONS: before asking anything, ask yourself whether a test would settle it (behavior, edge cases, validation, defaults, UI states). If yes, do NOT ask — pick the sensible default, write the failing test first, and list it under `defaults` [{text, test}] (\"Decided without asking — the test proves it\"). Ask only what a test cannot settle: product/business/legal/priority choices, max 5 per round. EVERY question is 3 buttons, in this order: yes (straightforward do it) · no (straightforward don’t) · more (an expanded variant, with `expert` = which specialist recommends it, e.g. UX/Legal/QA/Arch, and a one-line `detail`); exactly one `recommended`. Put them in the Artifact: `decisions` in /ship-artifact content, or a standalone /decision-form when there is no change yet. Publish with capabilities {\"comments\": {}}, make sure this session watches it, reply with the link + one line. Answers arrive as an artifact comment starting with [decision-form]. Never a question list in chat; one trivial yes/no may still be asked inline."
  }
}'
