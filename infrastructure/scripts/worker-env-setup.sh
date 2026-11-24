#!/usr/bin/env bash
# Setup script for the nightly worker's claude.ai environment (CORE-257).
# Paste this file's contents into Routines -> Environment -> Setup script.
# The environment runs it in /home/user, before the repo is the working directory,
# so it has to find the clone first. Without the cd, corepack ignores the
# "packageManager" pin, downloads pnpm 12 and fails with ERR_PNPM_NO_PKG_MANIFEST.
set -euo pipefail

WORKSPACE_FILE="$(find /home/user /workspace -maxdepth 3 -name pnpm-workspace.yaml -not -path '*/node_modules/*' 2>/dev/null | head -n 1)"
if [ -z "$WORKSPACE_FILE" ]; then
  echo "worker-env-setup: no pnpm-workspace.yaml under /home/user or /workspace" >&2
  exit 1
fi

cd "$(dirname "$WORKSPACE_FILE")"
corepack enable
pnpm install --frozen-lockfile
