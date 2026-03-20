#!/usr/bin/env bash
# One-command project start: Docker, Node (nvm), DB migrations, API server + rep-app + website.
# Usage: npm run start  or  ./scripts/start.sh
#
# Prerequisites: Docker Desktop running, Node 20+ (nvm use)
# Docs: README.md, docs/RUNBOOK_LOCAL_DEV.md, foundation/docs/
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "NeoSleep – starting dev environment..."
echo ""

# --- 0. Ensure Docker is running (start Docker Desktop if needed) ---
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Starting Docker Desktop..."
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker
  elif [[ "$(uname)" == "Linux" ]]; then
    (sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null) || true
  fi
  echo "Waiting for Docker to be ready..."
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      echo "Docker is ready."
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: Docker did not start in time. Start Docker Desktop manually, then run: npm run start"
      exit 1
    fi
    sleep 2
  done
fi

# --- 1. Load nvm and use Node from .nvmrc ---
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 2>/dev/null || true
elif [ -n "$NVM_DIR" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 2>/dev/null || true
else
  echo "nvm not found. Ensure Node >= 20 (see .nvmrc). Continuing..."
fi

# --- 2. Start Docker ---
echo "Starting Docker (Postgres, Adminer, Directus)..."
docker compose up -d

# --- 3. Wait for Postgres ---
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U neosleep -d neosleep 2>/dev/null; then
    echo "Postgres is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Postgres did not become ready in time."
    exit 1
  fi
  sleep 1
done

# --- 4. Ensure root .env exists ---
ROOT_ENV="$REPO_ROOT/.env"
ROOT_ENV_EXAMPLE="$REPO_ROOT/.env.example"
if [ ! -f "$ROOT_ENV" ]; then
  echo "Creating .env from .env.example..."
  cp "$ROOT_ENV_EXAMPLE" "$ROOT_ENV"
fi
if ! grep -q "^DATABASE_URL=" "$ROOT_ENV" 2>/dev/null; then
  echo "Adding DATABASE_URL to .env"
  echo "" >> "$ROOT_ENV"
  echo "# Local Postgres (auto-added by start script)" >> "$ROOT_ENV"
  echo "DATABASE_URL=postgresql://neosleep:neosleep_local@localhost:5432/neosleep" >> "$ROOT_ENV"
fi

# --- 5. (Migrations run automatically on API startup via runMigrations()) ---

# --- 6. Install deps ---
echo "Installing dependencies..."
(corepack enable 2>/dev/null || true)
pnpm install 2>/dev/null || npm install

# --- 7. Print links and start API server + rep-app ---
echo ""
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  NeoSleep – Dev Environment                                 │"
echo "  ├─────────────────────────────────────────────────────────────┤"
echo "  │  Apps                                                       │"
echo "  │    App:          http://localhost:5173                         │"
echo "  │    Website:      http://localhost:5174                         │"
echo "  │    API server:   http://localhost:3000                         │"
echo "  ├─────────────────────────────────────────────────────────────┤"
echo "  │  Docker services                                            │"
echo "  │    Adminer:      http://localhost:8080  (DB admin)             │"
echo "  │    Directus:     http://localhost:8056  (CMS)                 │"
echo "  │    Postgres:     localhost:5432                                │"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""
echo "  Tests:  npm test"
echo "  Docs:   foundation/docs/, docs/RUNBOOK_LOCAL_DEV.md"
echo ""

npm run dev
