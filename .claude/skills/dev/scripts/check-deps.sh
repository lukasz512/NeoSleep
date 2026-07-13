#!/bin/bash
# Dependency health check across pnpm workspaces

echo "=== Outdated Packages ==="
pnpm outdated 2>/dev/null || echo "(run from project root or pnpm not installed)"

echo ""
echo "=== Security Audit (high+ severity) ==="
pnpm audit --audit-level=high 2>/dev/null || echo "(no high severity issues found)"

echo ""
echo "=== Duplicate Packages (potential deduplication) ==="
pnpm dedupe --check 2>/dev/null || echo "(run pnpm dedupe to check)"

echo ""
echo "=== Workspace Package List ==="
pnpm list --recursive --depth=0 2>/dev/null | head -40
