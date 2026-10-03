#!/usr/bin/env bash
# Self-test for prompt-submit-rules.sh and context-guard.sh (CORE-103).
# Usage: bash .claude/hooks/prompt-submit-rules.test.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES="$DIR/prompt-submit-rules.sh"
GUARD="$DIR/context-guard.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export CLAUDE_HOOK_STATE_DIR="$TMP/state"
FAILS=0

ok() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got '$2', want '$3')"; FAILS=$((FAILS + 1)); fi; }

# kind <hook> <json input> → full | reminder | guard | none
kind() {
  local out ctx; out="$(printf '%s' "$2" | bash "$1")"
  ctx="$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)"
  case "$ctx" in
    "") echo none ;;
    *"Standing rules"*) echo full ;;
    *"Reminder:"*) echo reminder ;;
    *"Context guard"*) echo guard ;;
    *) echo other ;;
  esac
}

echo "prompt-submit-rules.sh"
S='{"session_id":"s1","prompt":"x"}'
ok "prompt 1 gets the full rules"     "$(kind "$RULES" "$S")" full
for n in 2 3 4 5 6 7 8 9; do got="$(kind "$RULES" "$S")"; [ "$got" = none ] || ok "prompt $n is silent" "$got" none; done
ok "prompts 2-9 are silent"           none none
ok "prompt 10 gets a 1-line reminder" "$(kind "$RULES" "$S")" reminder
ok "prompt 11 is silent"              "$(kind "$RULES" "$S")" none
ok "another session starts with full" "$(kind "$RULES" '{"session_id":"s2","prompt":"x"}')" full
printf '%s' '{"session_id":"s1","source":"compact"}' | bash "$RULES" --reset >/dev/null
ok "after /compact the rules come back in full" "$(kind "$RULES" "$S")" full
ok "missing session_id still injects full rules" "$(kind "$RULES" '{"prompt":"x"}')" full

echo "context-guard.sh"
transcript() {  # transcript <file> <context tokens of the last assistant turn>
  jq -cn --argjson t "$2" '{type:"assistant",message:{usage:{input_tokens:10,cache_creation_input_tokens:0,cache_read_input_tokens:($t-10),output_tokens:5}}}' > "$1"
}
transcript "$TMP/small.jsonl" 80000
ok "below 120k: silent" "$(kind "$GUARD" "$(jq -cn --arg p "$TMP/small.jsonl" '{session_id:"g1",transcript_path:$p}')")" none
transcript "$TMP/big.jsonl" 130000
IN="$(jq -cn --arg p "$TMP/big.jsonl" '{session_id:"g1",transcript_path:$p}')"
ok "above 120k: fires"            "$(kind "$GUARD" "$IN")" guard
ok "above 120k again: fires once" "$(kind "$GUARD" "$IN")" none
transcript "$TMP/huge.jsonl" 170000
ok "above 160k: fires a second, last time" "$(kind "$GUARD" "$(jq -cn --arg p "$TMP/huge.jsonl" '{session_id:"g1",transcript_path:$p}')")" guard
ok "no transcript: silent" "$(kind "$GUARD" '{"session_id":"g2","transcript_path":"/nope.jsonl"}')" none

[ "$FAILS" -eq 0 ] && echo "all checks passed" || { echo "$FAILS check(s) failed"; exit 1; }
