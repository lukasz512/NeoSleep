#!/usr/bin/env sh
# Ensures pnpm-lock.yaml is in sync with package.json.
# Run from repo root. Runs pnpm install, then fails if lockfile has uncommitted changes.

set -e
pnpm install
if ! git diff --exit-code pnpm-lock.yaml >/dev/null 2>&1; then
  echo "Lockfile is out of sync. Run pnpm install and commit pnpm-lock.yaml."
  exit 1
fi
