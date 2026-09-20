#!/usr/bin/env bash
# Reads changed file paths (one per line) on stdin, prints the unique
# apps/* or packages/* workspace directories they fall under (one per line,
# e.g. "apps/pwa"). Shared by .claude/hooks/quality-gate.sh and the Husky
# pre-push hook so the two never drift apart on how "affected workspaces"
# is computed.
set -euo pipefail

sed -E 's#^(apps/[^/]+|packages/[^/]+)/.*#\1#' | grep -E '^(apps|packages)/' | sort -u
