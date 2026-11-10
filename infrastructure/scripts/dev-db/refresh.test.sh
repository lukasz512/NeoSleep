#!/usr/bin/env bash
# End-to-end test for refresh.sh (CORE-189). Needs Docker and the worktree test
# database (pnpm test-db up --migrate).
#
# Plants personal data in a tenant schema of the migrated test DB, dumps the whole
# DB as the "production backup", runs refresh.sh against an empty local Postgres
# standing in for the dev project, and checks that the tenant arrived with the
# planted data replaced and the internal account intact. Also checks the guard:
# a non-dev DATABASE_URL is refused before anything runs.
#
# Usage: bash infrastructure/scripts/dev-db/refresh.test.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:${TEST_DB_PORT:-54329}/$(bash "$HERE/../test-db.sh" dbname)}"
SCHEMA=refresh_test
TARGET=dev-db-refresh-test-target
TARGET_URL="postgresql://postgres:t@localhost:55434/postgres"
WORK="$(mktemp -d)"
fail() { echo "FAIL: $*"; exit 1; }
cleanup() {
  docker rm -f "$TARGET" >/dev/null 2>&1 || true
  psql "$SRC_URL" -qc "DROP SCHEMA IF EXISTS $SCHEMA CASCADE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
cleanup; mkdir -p "$WORK"

out="$(DEV_ENV_FILE=/dev/null DATABASE_URL="postgresql://postgres.prodref:x@aws.pooler.supabase.com:5432/postgres" \
  bash "$HERE/refresh.sh" "$WORK/none.dump" - 2>&1)" && fail "refresh.sh accepted a non-dev DATABASE_URL"
grep -q refusing <<<"$out" || fail "guard message missing: $out"
echo "ok: non-dev target refused"

psql "$SRC_URL" -v ON_ERROR_STOP=1 -q -c "SELECT create_tenant_schema('$SCHEMA')" >/dev/null
psql "$SRC_URL" -v ON_ERROR_STOP=1 -q -c "SET search_path = $SCHEMA, public" -f "$HERE/pii-fixture.sql"
pg_dump "$SRC_URL" --format=custom -f "$WORK/prod.dump"

docker run -d --name "$TARGET" -e POSTGRES_PASSWORD=t -p 55434:5432 postgres:17 >/dev/null
until docker exec "$TARGET" pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done
sleep 1
# Something dev already has that the refresh must replace, not merge with.
psql "$TARGET_URL" -q -c "CREATE SCHEMA $SCHEMA" -c "CREATE TABLE $SCHEMA.stale (id int)"

DEV_ENV_FILE=/dev/null DATABASE_URL="$TARGET_URL" bash "$HERE/refresh.sh" "$WORK/prod.dump" - > "$WORK/refresh.log" 2>&1 \
  || { tail -30 "$WORK/refresh.log"; fail "refresh.sh failed"; }
echo "ok: refresh.sh completed"

[ "$(psql "$TARGET_URL" -Atc "SELECT to_regclass('$SCHEMA.stale') IS NULL")" = t ] || fail "stale dev table survived"
[ "$(psql "$TARGET_URL" -Atc "SELECT count(*) FROM $SCHEMA.identities")" = 3 ] || fail "identities did not arrive"
PLANTED="$(sed -n 's/^-- planted: //p' "$HERE/pii-fixture.sql")"
left="$(pg_dump "$TARGET_URL" --data-only --schema="$SCHEMA" 2>/dev/null | grep -Eo "$PLANTED" | sort -u || true)"
[ -z "$left" ] || fail "planted personal data reached the dev target: $left"
echo "ok: no planted personal data on the dev target"
staff="$(psql "$TARGET_URL" -Atc "SELECT email FROM $SCHEMA.identities WHERE first_name = 'Staffina'")"
[ "$staff" = staffina@neosleepcare.com ] || fail "internal account missing on target"
echo "PASS: refresh.sh"
