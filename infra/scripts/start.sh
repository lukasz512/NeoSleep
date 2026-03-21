#!/usr/bin/env bash
# infra/scripts/start.sh
# Główny skrypt dev: uruchamia Docker (Postgres + Adminer), czeka na gotowość BD,
# zapewnia .env i zależności, a następnie odpala wszystkie serwisy przez pnpm dev.
# Użycie: pnpm start  (lub bezpośrednio: ./infra/scripts/start.sh)
# Wymagania: Docker Desktop uruchomiony, Node 20+ (nvm), pnpm
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ─── 1. Sprawdź czy Docker działa; jeśli nie — uruchom Docker Desktop ─────────
if ! docker info >/dev/null 2>&1; then
  echo "Docker nie działa. Uruchamiam Docker Desktop..."
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker
  elif [[ "$(uname)" == "Linux" ]]; then
    (sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null) || true
  fi

  echo "Czekam na Docker..."
  for i in $(seq 1 60); do
    docker info >/dev/null 2>&1 && echo "Docker gotowy." && break
    [ "$i" -eq 60 ] && echo "BŁĄD: Docker nie wystartował w czasie. Uruchom Docker Desktop ręcznie." && exit 1
    sleep 2
  done
fi

# ─── 2. Załaduj nvm i użyj wersji Node z .nvmrc ───────────────────────────────
# nvm nie jest dostępny jako komenda w subshell — trzeba go ręcznie sourco'wać
NVM_SCRIPT="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$NVM_SCRIPT" ]; then
  # shellcheck source=/dev/null
  . "$NVM_SCRIPT"
  nvm use 2>/dev/null || true
else
  echo "nvm nie znaleziony. Upewnij się że masz Node >= 20 (patrz .nvmrc). Kontynuuję..."
fi

# ─── 3. Uruchom kontenery Docker (Postgres + Adminer) ─────────────────────────
# docker-compose.yml definiuje healthcheck dla Postgres — Adminer czeka na niego sam
echo "Uruchamiam Docker (Postgres + Adminer)..."
docker compose -f infra/docker-compose.yml up -d

# ─── 4. Poczekaj na gotowość Postgres ─────────────────────────────────────────
# Postgres potrzebuje chwili po starcie kontenera zanim zacznie akceptować połączenia
echo "Czekam na Postgres..."
for i in $(seq 1 30); do
  docker compose -f infra/docker-compose.yml exec -T postgres pg_isready -U neosleep -d neosleep 2>/dev/null && echo "Postgres gotowy." && break
  [ "$i" -eq 30 ] && echo "BŁĄD: Postgres nie odpowiada. Sprawdź logi: docker compose logs postgres" && exit 1
  sleep 1
done

# ─── 5. Upewnij się że .env istnieje ─────────────────────────────────────────
# .env nie jest w repozytorium — przy pierwszym uruchomieniu kopiujemy z .env.example
if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "Tworzę .env z .env.example..."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

# Dodaj DATABASE_URL jeśli brakuje — wymagane przez API (services/api/src/db/connection.ts)
if ! grep -q "^DATABASE_URL=" "$REPO_ROOT/.env" 2>/dev/null; then
  echo "Dodaję DATABASE_URL do .env..."
  printf "\n# Local Postgres (dodane automatycznie przez start.sh)\nDATABASE_URL=postgresql://neosleep:neosleep_local@localhost:5432/neosleep\n" >> "$REPO_ROOT/.env"
fi

# ─── 6. Zainstaluj zależności ─────────────────────────────────────────────────
# pnpm install jest szybkie jeśli lockfile się nie zmienił — bezpieczne do odpalania za każdym razem
echo "Instaluję zależności..."
(corepack enable 2>/dev/null || true)
pnpm install 2>/dev/null || npm install

# ─── 7. Uruchom serwisy (API + app + website + telegram) ──────────────────────
# Migracje BD uruchamiają się automatycznie przy starcie API (services/api/src/db/migrations.ts)
# concurrently odpala wszystkie procesy z kolorowymi prefixami w jednym terminalu
echo ""
echo "Startuję serwisy..."
echo "  API:      http://localhost:3000"
echo "  App:      http://localhost:5173"
echo "  Website:  http://localhost:5174"
echo "  Adminer:  http://localhost:8080"
echo ""

npm run dev
