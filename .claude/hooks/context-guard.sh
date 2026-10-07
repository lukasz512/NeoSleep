#!/usr/bin/env bash
# UserPromptSubmit hook: context guard (CORE-103, 2026-10-03). 94% of Łukasz's usage ran
# at >150k context — every turn re-sends the whole history, so a long session costs more
# per prompt than a fresh one. When the last turn's context passes 120k (and once more
# past 160k) this tells Claude to write a handoff file. Compaction itself is automatic
# (CORE-175): settings.json sets CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000, so Claude Code
# compacts on its own near ~180k instead of near the 1M model limit. Hooks cannot run
# /compact; that env var is the supported switch.
#
# Context size = the last assistant turn's input + cache-read + cache-creation tokens,
# which is exactly what that request sent.
set -uo pipefail

INPUT="$(cat)"
SID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)"
[ -n "$SID" ] && [ -f "$TRANSCRIPT" ] || exit 0

TOKENS="$(tail -n 400 "$TRANSCRIPT" | jq -r 'select(.type == "assistant" and .message.usage != null)
  | .message.usage | (.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0)' 2>/dev/null | tail -1)"
[ -n "$TOKENS" ] || exit 0

STATE_DIR="${CLAUDE_HOOK_STATE_DIR:-}"
if [ -z "$STATE_DIR" ]; then
  COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && STATE_DIR="$(dirname "$COMMON")/.claude/local/hook-state"
fi
[ -n "$STATE_DIR" ] && mkdir -p "$STATE_DIR" 2>/dev/null || exit 0
FIRED_FILE="$STATE_DIR/guard-$SID.level"
find "$STATE_DIR" -name 'guard-*.level' -mtime +7 -delete 2>/dev/null
FIRED="$(cat "$FIRED_FILE" 2>/dev/null || echo 0)"

LEVEL=0
[ "$TOKENS" -ge 120000 ] && LEVEL=1
[ "$TOKENS" -ge 160000 ] && LEVEL=2
[ "$LEVEL" -gt "$FIRED" ] || exit 0
printf '%s' "$LEVEL" > "$FIRED_FILE"

K=$(( TOKENS / 1000 ))
MSG="Context guard: this session is at ~${K}k tokens of context, and every further prompt re-sends all of it. Auto-compact fires by itself near ~180k (CLAUDE_CODE_AUTO_COMPACT_WINDOW), so before you start new work in this turn write a handoff to .claude/local/handoff/<branch-or-topic>.md (≤40 lines: goal, ticket, branch/worktree, what is done, what is left, open decisions, key file paths, artifact links); the compacted session resumes from it. 1 ticket = 1 session (CORE-175): if this ticket is already handed over (Artifact or light board comment), end the reply with one line for Łukasz: next ticket → /clear."
jq -n --arg ctx "$MSG" --arg sys "Context ~${K}k — handoff written; auto-compact near 180k." \
  '{systemMessage: $sys, hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
