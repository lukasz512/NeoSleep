#!/usr/bin/env bash
# Setup script for the nightly worker's claude.ai environment (CORE-257).
# Paste this file's contents into Routines -> Environment -> Setup script.
# The environment runs it in /home/user, before the repo is the working directory,
# so it has to find the clone first. Without the cd, corepack ignores the
# "packageManager" pin, downloads pnpm 12 and fails with ERR_PNPM_NO_PKG_MANIFEST.
set -euo pipefail

# find exits non-zero when a search root is missing (e.g. /workspace); with pipefail that
# would kill the script before it looked anywhere else, so tolerate it and check the result.
WORKSPACE_FILE="$( (find "$PWD" /home /workspace /workspaces /mnt /tmp -maxdepth 4 -name pnpm-workspace.yaml -not -path '*/node_modules/*' 2>/dev/null || true) | head -n 1)"
if [ -z "$WORKSPACE_FILE" ]; then
  echo "worker-env-setup: no pnpm-workspace.yaml found (PWD=$PWD)" >&2
  ls -la "$PWD" /home /workspace 2>&1 | head -n 40 >&2 || true
  exit 1
fi

cd "$(dirname "$WORKSPACE_FILE")"
corepack enable
pnpm install --frozen-lockfile
