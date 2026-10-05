#!/usr/bin/env bash
# Resets the LOCAL guide database and seeds the demo doctor + Tester Patient-1..4.
# Run before shots.mjs: the QR shot creates a real questionnaire request, so a
# second run on the same data would show different states.
#
#   docs/user-guide/reset-local.sh [container]   (default container: guide-pg)
set -euo pipefail
CONTAINER="${1:-guide-pg}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker exec "$CONTAINER" psql -U postgres -qc \
  "DROP SCHEMA IF EXISTS neosleep CASCADE; DROP SCHEMA IF EXISTS fourseasons CASCADE; DROP SCHEMA IF EXISTS platform CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null
cd "$ROOT/apps/api"
npx tsx --env-file=../../.env scripts/migrate.ts | grep "\[migrate\]"
npx tsx --env-file=../../.env scripts/seed-guide-data.ts | grep "\[seed-guide-data\]"
