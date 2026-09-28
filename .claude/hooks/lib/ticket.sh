#!/usr/bin/env bash
# Shared ticket-ID parsing for hooks and scripts (CORE-23). Source it, then call
# `ticket_of <branch>` → prints e.g. CORE-12 or NEO-163, empty when the branch has none.
# Team keys come from .claude/ticket-teams (one per line); NEO is the fallback.

_ticket_teams_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/ticket-teams"

ticket_regex() {
  local keys=""
  if [ -f "$_ticket_teams_file" ]; then
    keys="$(grep -vE '^\s*(#|$)' "$_ticket_teams_file" | tr -d ' \r' | paste -sd '|' -)"
  fi
  # Anchored on a non-alphanumeric so "hardcore-5" is not CORE-5.
  printf '(^|[^[:alnum:]])(%s)-[0-9]+' "${keys:-NEO}"
}

ticket_of() {
  printf '%s' "$1" | grep -oiE "$(ticket_regex)" | head -1 | sed 's/^[^[:alnum:]]//' | tr '[:lower:]' '[:upper:]'
}
