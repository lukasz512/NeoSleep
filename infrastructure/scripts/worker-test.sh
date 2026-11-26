#!/usr/bin/env bash
# infrastructure/scripts/worker-test.sh
# Pulls a linear-worker-produced branch into a dedicated git worktree
# (sibling to this repo, one per branch), installs deps, builds the rep
# app, and opens the worktree in VSCode — so changes can be tested locally
# before merging, without touching the main working tree.
# Usage: pnpm worker:test <branch>  (e.g. pnpm worker:test worker/neo-33-slug)
set -e

BRANCH="$1"
if [ -z "$BRANCH" ]; then
  echo "Usage: pnpm worker:test <branch>"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ─── 1. Confirm the branch still exists on origin ──────────────────────────
if ! git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  echo "ERROR: branch '$BRANCH' not found on origin (deleted or force-pushed away?)."
  exit 1
fi

git fetch origin "$BRANCH"

# ─── 2. Create or reuse a dedicated worktree, sibling to this repo ─────────
WORKTREE_DIR="$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT")-worker-$(echo "$BRANCH" | tr '/' '-')"

if git worktree list | awk '{print $1}' | grep -qx "$WORKTREE_DIR"; then
  echo "Reusing existing worktree at $WORKTREE_DIR"
  cd "$WORKTREE_DIR"
  if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: $WORKTREE_DIR has uncommitted changes — resolve or remove them manually before re-running."
    exit 1
  fi
  git reset --hard "origin/$BRANCH"
else
  echo "Creating worktree at $WORKTREE_DIR"
  git worktree add -B "$BRANCH" "$WORKTREE_DIR" "origin/$BRANCH"
  cd "$WORKTREE_DIR"
fi

# ─── 3. Install deps and build the rep app ──────────────────────────────────
echo "Installing dependencies..."
pnpm install --reporter=silent 2>/dev/null || pnpm install

echo "Building @neo/pwa..."
pnpm build:pwa

# ─── 4. Open in VSCode ───────────────────────────────────────────────────────
if command -v code > /dev/null 2>&1; then
  code "$WORKTREE_DIR"
else
  echo "VSCode 'code' CLI not found on PATH — open manually: $WORKTREE_DIR"
  echo "(In VSCode: Cmd+Shift+P -> 'Shell Command: Install code command in PATH')"
fi

echo ""
echo "Ready to test: $WORKTREE_DIR"
echo "Run 'pnpm dev' (or 'pnpm --filter @neo/pwa dev') inside it to click around before merging."
