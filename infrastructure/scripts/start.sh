#!/usr/bin/env bash
# infrastructure/scripts/start.sh
# Main dev script: ensures .env and dependencies, then starts all
# services via pnpm dev. DB is remote Supabase (DATABASE_URL in .env) — no
# local Postgres/Docker needed.
# Usage: pnpm start  (or directly: ./infrastructure/scripts/start.sh)
# Requirements: Node 20+ (nvm), pnpm
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ─── 1. Load nvm and use the Node version from .nvmrc ────────────────────────
# nvm isn't available as a command in a subshell — it must be sourced manually
NVM_SCRIPT="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$NVM_SCRIPT" ]; then
  # shellcheck source=/dev/null
  . "$NVM_SCRIPT"
  nvm use --silent 2>/dev/null || true
else
  echo "nvm not found. Make sure you have Node >= 20 (see .nvmrc). Continuing..."
fi

# ─── 2. Make sure .env exists and has DATABASE_URL ────────────────────────────
# .env is not committed — on first run we copy it from .env.example
if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "Creating .env from .env.example..."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

if ! grep -q "^DATABASE_URL=.\+" "$REPO_ROOT/.env" 2>/dev/null; then
  echo "ERROR: DATABASE_URL is not set in .env."
  echo "Paste the connection string from Supabase (Project Settings → Database → Connection string)."
  exit 1
fi

# ─── 3. Install dependencies ──────────────────────────────────────────────────
# pnpm install is fast if the lockfile hasn't changed — safe to run every time
echo "Installing dependencies..."
(corepack enable 2>/dev/null || true)
pnpm install --reporter=silent 2>/dev/null || npm install --silent

# ─── 4. Build compiled packages (not raw .ts like packages/stores/ui) ────────
# @neo/email is a real compiled package (apps/api is plain Node without a
# bundler, unlike the Vite apps/pwa and apps/web, so it can't import raw .ts)
# — without this step `tsx --watch` in apps/api fails on startup with
# ERR_MODULE_NOT_FOUND because node_modules/@neo/email/dist doesn't exist yet.
echo "Building @neo/email..."
pnpm --filter @neo/email build

# ─── 5. Start services (API + app + website + telegram) ──────────────────────
# DB migrations run automatically on API startup (apps/api/src/db/migrations.ts)
# against DATABASE_URL from .env (Supabase) — no local DB to wait for.
# concurrently runs all processes with colored prefixes in a single terminal
echo ""
echo "Starting services..."
echo "  API:      http://localhost:3000"
echo "  App:      http://localhost:5173"
echo "  Website:  http://localhost:5174"
echo ""

npm run dev
