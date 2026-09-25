#!/usr/bin/env bash
# UserPromptSubmit hook: standing "refactor your own reply" rule (Łukasz, 2026-09-25).
# He wants less noise: the final message of a turn is only what needs his attention.
#
# Why prompt-time and not a Stop hook: a Stop hook can't edit a reply that was
# already shown — blocking it only makes Claude write a SECOND, shorter message
# under the long one, which is more noise, not less. Injecting the rule before
# the reply is written is the only way to get one short reply.
set -uo pipefail

jq -n '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: "Reply rule (every turn, Łukasz 2026-09-25): before sending your FINAL message, refactor it down to what needs his attention. Keep: (1) the outcome in at most 2 sentences; (2) anything that needs his decision or action — open questions, risks, a failed or skipped step, the link he needs (artifact / PR). Drop: test counts, file lists, what you checked or how, process narration, restating his request, internal fixes he does not have to act on — that detail belongs in the Artifact, not the reply. Never drop a decision he must make or a failure. Artifacts follow the same shape: open with a 2-sentence summary and a \"Needs your decision\" box (omit the box when there is nothing to decide); the detail goes below it."
  }
}'
