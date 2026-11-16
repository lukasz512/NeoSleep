#!/usr/bin/env bash
# Self-test for lib/change-shape.sh and post-push.sh (CORE-175).
# Usage: bash .claude/hooks/post-push.test.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/change-shape.sh
source "$DIR/lib/change-shape.sh"
FAILS=0

ok() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got '$2', want '$3')"; FAILS=$((FAILS + 1)); fi; }

echo "change_shape (D2: full Artifact only for UI/feature changes)"
ok "a .vue file is full"            "$(change_shape $'apps/pwa/src/components/A.vue')" full
ok "a .scss file is full"           "$(change_shape $'packages/ui/src/x.scss')" full
ok "a new view is full"             "$(change_shape $'apps/pwa/src/views/PatientsView.ts')" full
ok "an api route is full"           "$(change_shape $'apps/api/src/routes/patients.ts')" full
ok "a migration is full"            "$(change_shape $'apps/api/migrations/090_x.sql')" full
ok "a service fix is light"         "$(change_shape $'apps/api/src/services/order.ts\napps/api/src/services/order.spec.ts')" light
ok "hooks and docs are light"       "$(change_shape $'.claude/hooks/quality-gate.sh\ndocs/CLAUDE_WORKFLOW.md')" light
ok "a mix with one .vue is full"    "$(change_shape $'docs/a.md\napps/pwa/src/App.vue')" full
ok "nothing changed is light"       "$(change_shape '')" light

echo "post-push.sh"
hook() {
  local out; out="$(printf '%s' "$1" | bash "$DIR/post-push.sh")"
  [ -z "$out" ] && { echo none; return; }
  printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // "none"'
}
OUT="$(hook '{"tool_name":"Bash","tool_input":{"command":"git push -u origin worktree-core-1-x"},"tool_response":{"stdout":"","stderr":"","interrupted":false}}')"
case "$OUT" in *handoff*) ok "a push gets the handover steps" yes yes ;; *) ok "a push gets the handover steps" "$OUT" handoff ;; esac
case "$OUT" in *"/clear"*) ok "it ends with the /clear line" yes yes ;; *) ok "it ends with the /clear line" no yes ;; esac
ok "a non-push command is silent" "$(hook '{"tool_name":"Bash","tool_input":{"command":"git status"},"tool_response":{}}')" none
ok "git push --dry-run is silent" "$(hook '{"tool_name":"Bash","tool_input":{"command":"git push --dry-run origin x"},"tool_response":{}}')" none
ok "a rejected push is silent"    "$(hook '{"tool_name":"Bash","tool_input":{"command":"git push origin x"},"tool_response":{"stderr":"! [rejected] x -> x (non-fast-forward)\nerror: failed to push some refs"}}')" none

[ "$FAILS" -eq 0 ] && echo "all passed" || { echo "$FAILS failed"; exit 1; }
