#!/usr/bin/env bash
# Reads changed file paths (one per line) on stdin, prints the unique
# apps/* or packages/* workspace directories they fall under (one per line,
# e.g. "apps/pwa"). Shared by .claude/hooks/quality-gate.sh and the Husky
# pre-push hook so the two never drift apart on how "affected workspaces"
# is computed.
set -euo pipefail

# grep exits 1 when nothing matches (the normal "no apps/packages files
# changed" case) — under pipefail that would kill this whole script, so its
# failure is swallowed here; sort still runs (on empty input) and this
# script itself always exits 0.
sed -E 's#^(apps/[^/]+|packages/[^/]+)/.*#\1#' | { grep -E '^(apps|packages)/' || true; } | sort -u
