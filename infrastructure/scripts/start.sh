#!/usr/bin/env bash
# infrastructure/scripts/start.sh
# Główny skrypt dev: zapewnia .env i zależności, a następnie odpala wszystkie
# serwisy przez pnpm dev. DB to zdalny Supabase (DATABASE_URL w .env) — brak
# lokalnego Postgresa/Dockera.
# Użycie: pnpm start  (lub bezpośrednio: ./infrastructure/scripts/start.sh)
# Wymagania: Node 20+ (nvm), pnpm
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ─── 1. Załaduj nvm i użyj wersji Node z .nvmrc ───────────────────────────────
# nvm nie jest dostępny jako komenda w subshell — trzeba go ręcznie sourco'wać
NVM_SCRIPT="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$NVM_SCRIPT" ]; then
  # shellcheck source=/dev/null
  . "$NVM_SCRIPT"
  nvm use --silent 2>/dev/null || true
else
  echo "nvm nie znaleziony. Upewnij się że masz Node >= 20 (patrz .nvmrc). Kontynuuję..."
fi

# ─── 2. Upewnij się że .env istnieje i ma DATABASE_URL ────────────────────────
# .env nie jest w repozytorium — przy pierwszym uruchomieniu kopiujemy z .env.example
if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "Tworzę .env z .env.example..."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

if ! grep -q "^DATABASE_URL=.\+" "$REPO_ROOT/.env" 2>/dev/null; then
  echo "BŁĄD: DATABASE_URL nie jest ustawiony w .env."
  echo "Wklej connection string z Supabase (Project Settings → Database → Connection string)."
  exit 1
fi

# ─── 3. Zainstaluj zależności ─────────────────────────────────────────────────
# pnpm install jest szybkie jeśli lockfile się nie zmienił — bezpieczne do odpalania za każdym razem
echo "Instaluję zależności..."
(corepack enable 2>/dev/null || true)
pnpm install --reporter=silent 2>/dev/null || npm install --silent

# ─── 4. Zbuduj pakiety kompilowane (nie surowe .ts jak packages/stores/ui) ─────
# @neo/email jest prawdziwym skompilowanym pakietem (apps/api to zwykły Node bez
# bundlera, nie może zaimportować surowego .ts jak robią to Vite'owe apps/pwa i
# apps/web) — bez tego kroku `tsx --watch` w apps/api wywali się na starcie z
# ERR_MODULE_NOT_FOUND, bo node_modules/@neo/email/dist jeszcze nie istnieje.
echo "Buduję @neo/email..."
pnpm --filter @neo/email build

# ─── 5. Uruchom serwisy (API + app + website + telegram) ──────────────────────
# Migracje BD uruchamiają się automatycznie przy starcie API (apps/api/src/db/migrations.ts)
# przeciwko DATABASE_URL z .env (Supabase) — nie ma lokalnej bazy do czekania.
# concurrently odpala wszystkie procesy z kolorowymi prefixami w jednym terminalu
echo ""
echo "Startuję serwisy..."
echo "  API:      http://localhost:3000"
echo "  App:      http://localhost:5173"
echo "  Website:  http://localhost:5174"
echo ""

npm run dev
