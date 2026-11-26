#!/bin/bash
# Project status snapshot for standup generation

echo "=== Recent Commits (last 2 days) ==="
git log --since=2.days.ago --oneline --all 2>/dev/null | head -20 || echo "(not a git repo)"

echo ""
echo "=== Open PRs ==="
gh pr list --state=open 2>/dev/null || echo "(gh CLI not configured or no open PRs)"

echo ""
echo "=== Current Branch ==="
git branch --show-current 2>/dev/null || echo "unknown"

echo ""
echo "=== Uncommitted Changes ==="
git status --short 2>/dev/null || echo "(none)"

echo ""
echo "=== Last 3 Tags ==="
git tag --sort=-creatordate 2>/dev/null | head -3 || echo "(no tags)"
