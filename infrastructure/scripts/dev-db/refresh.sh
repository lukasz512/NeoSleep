#!/usr/bin/env bash
# Rebuilds the dev database + dev Storage from a production backup, anonymized
# (CORE-189). Personal data is replaced in a local throwaway Postgres and in a
# local temp directory, so real patient data never reaches the dev project.
#
# Usage:
#   refresh.sh <db.dump> <storage.tar.gz>
#   refresh.sh --in-place   anonymize what is already in the dev project (DB + Storage);
#                           only for real data that got there some other way (a drill)
#     <db.dump>         decrypted nightly backup (neosleep-db-<stamp>.dump.age → age -d)
#     <storage.tar.gz>  decrypted storage backup; pass - to skip Storage
#   Env (default: read from .claude/local/supabase-dev.env):
#     DATABASE_URL          dev database (Supabase session pooler URL)
#     SUPABASE_URL          https://<dev ref>.supabase.co
#     SUPABASE_SERVICE_KEY  dev service_role key
#     DEV_SUPABASE_REF      dev project ref; every URL must point at it (default below)
#   Needs Docker, pg_restore/pg_dump/psql 17, node, and pnpm install (for supabase-js).
#
# Steps: restore into staging (restore-check.sh) → anonymize.sql → pii-check.sql →
# dump the app schemas → replace them on dev → pii-check.sql on dev →
# Storage: extract → dev-storage.mjs scrub-dir → upload.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
USAGE="usage: refresh.sh <db.dump> <storage.tar.gz|-> | --in-place"
DUMP="${1:?$USAGE}"
[ "$DUMP" = --in-place ] || STORAGE="${2:?$USAGE}"
ENV_FILE="${DEV_ENV_FILE:-$ROOT/.claude/local/supabase-dev.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
DEV_SUPABASE_REF="${DEV_SUPABASE_REF:-xlblsuntdaoqhkayufrn}"
: "${DATABASE_URL:?DATABASE_URL (dev) must be set}"
export DEV_SUPABASE_REF

# The only targets this script may write to: the dev project, or a local Postgres
# (self-test). Production is neither.
case "$DATABASE_URL" in
  *"postgres.$DEV_SUPABASE_REF:"*|*"@db.$DEV_SUPABASE_REF.supabase.co"*|*"@localhost:"*|*"@127.0.0.1:"*) ;;
  *) echo "refresh: DATABASE_URL is not the dev project $DEV_SUPABASE_REF; refusing" >&2; exit 1 ;;
esac

# supabase-js comes from apps/api's node_modules (pnpm install), like storage-export.mjs in CI.
dev_storage() {
  local tool
  tool="$(mktemp -d)"
  cp "$HERE/dev-storage.mjs" "$tool/"
  ln -s "$ROOT/apps/api/node_modules" "$tool/node_modules"
  node "$tool/dev-storage.mjs" "$@"
  rm -rf "$tool"
}

if [ "$DUMP" = --in-place ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/anonymize.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/pii-check.sql"
  dev_storage scrub-live
  exit 0
fi

STAGING=dev-db-refresh-staging
STAGING_PORT="${STAGING_PORT:-55433}"
STAGING_URL="postgresql://postgres:t@localhost:$STAGING_PORT/postgres"
WORK="$(mktemp -d)"
cleanup() { docker rm -f "$STAGING" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
cleanup; mkdir -p "$WORK"
START=$(date +%s)

echo "== 1/5 restore into local staging Postgres"
docker run -d --name "$STAGING" -e POSTGRES_PASSWORD=t -p "$STAGING_PORT:5432" postgres:17 >/dev/null
until docker exec "$STAGING" pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done
sleep 1
RESTORE_URL="$STAGING_URL" bash "$ROOT/infrastructure/scripts/nightly-backup/restore-check.sh" "$DUMP"

echo "== 2/5 anonymize + check on staging"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/anonymize.sql"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/pii-check.sql"

echo "== 3/5 dump anonymized app schemas"
SCHEMAS=()
while IFS= read -r s; do SCHEMAS+=("$s"); done < <(psql "$STAGING_URL" -At -c \
  "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname NOT IN ('information_schema', 'extensions') ORDER BY 1")
SCHEMA_ARGS=(); for s in "${SCHEMAS[@]}"; do SCHEMA_ARGS+=(--schema="$s"); done
pg_dump "$STAGING_URL" --format=custom --no-owner --no-privileges "${SCHEMA_ARGS[@]}" -f "$WORK/anon.dump"
echo "schemas: ${SCHEMAS[*]}"

echo "== 4/5 replace app schemas on dev"
# Supabase owns the public schema itself: keep it, replace only our objects in it.
pg_restore --list "$WORK/anon.dump" | grep -v ' SCHEMA - public ' > "$WORK/anon.list"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "CREATE SCHEMA IF NOT EXISTS extensions"
while IFS= read -r ext; do
  [ "$ext" = plpgsql ] && continue
  psql "$DATABASE_URL" -q -c "CREATE EXTENSION IF NOT EXISTS \"$ext\" SCHEMA extensions" 2>/dev/null || true
done < <(pg_restore --list "$DUMP" | awk '$4 == "EXTENSION" && $5 == "-" { print $6 }' | sort -u)
for s in "${SCHEMAS[@]}"; do
  [ "$s" = public ] || psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA IF EXISTS \"$s\" CASCADE"
done
pg_restore --dbname="$DATABASE_URL" --no-owner --no-privileges --clean --if-exists --exit-on-error \
  --use-list="$WORK/anon.list" "$WORK/anon.dump"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/pii-check.sql"

echo "== 5/5 Storage"
if [ "$STORAGE" = - ]; then
  echo "skipped"
else
  mkdir -p "$WORK/files"
  tar -xzf "$STORAGE" -C "$WORK/files"
  root="$WORK/files"; [ -d "$root/storage" ] && root="$root/storage"
  node "$HERE/dev-storage.mjs" scrub-dir "$root"
  dev_storage upload "$root"
fi

echo "Dev refresh done in $(( ($(date +%s) - START) / 60 )) min. Decrypted inputs are still on disk: delete $DUMP and $STORAGE."
