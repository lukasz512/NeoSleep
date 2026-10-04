#!/usr/bin/env bash
# Regression test for restore-check.sh (CORE-71). Needs Docker.
#
# Builds a small source DB that mirrors what broke the nightly backup on 2026-09-27:
# a tenant table whose EXCLUDE constraint needs btree_gist (migration 035), plus an
# ltree column. Dumps it, then runs restore-check.sh against an empty Postgres 17.
# Before the fix the restore failed with
#   "data type uuid has no default operator class for access method gist".
#
# Usage: bash infrastructure/scripts/nightly-backup/restore-check.test.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC=restore-check-test-src
DST=restore-check-test-dst
WORK="$(mktemp -d)"
remove_containers() { docker rm -f "$SRC" "$DST" >/dev/null 2>&1 || true; }
trap 'remove_containers; rm -rf "$WORK"' EXIT
remove_containers

docker run -d --name "$SRC" -e POSTGRES_PASSWORD=t postgres:17 >/dev/null
docker run -d --name "$DST" -e POSTGRES_PASSWORD=t -p 55432:5432 postgres:17 >/dev/null
for c in "$SRC" "$DST"; do
  until docker exec "$c" pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done
done
sleep 1

docker exec -i "$SRC" psql -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA extensions;
CREATE EXTENSION btree_gist SCHEMA extensions;
CREATE EXTENSION ltree SCHEMA extensions;
CREATE SCHEMA tenant_test;
SET search_path = tenant_test, extensions, public;
CREATE TABLE tenant_test.appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  slot tstzrange NOT NULL,
  EXCLUDE USING gist (doctor_id WITH =, slot WITH &&)
);
CREATE TABLE tenant_test.territory (id serial PRIMARY KEY, path extensions.ltree);
INSERT INTO tenant_test.appointment (doctor_id, slot)
  VALUES (gen_random_uuid(), tstzrange(now(), now() + interval '1 hour'));
INSERT INTO tenant_test.territory (path) VALUES ('mx.cdmx');
SQL

docker exec "$SRC" pg_dump -U postgres --format=custom -f /tmp/test.dump postgres
docker cp "$SRC:/tmp/test.dump" "$WORK/test.dump"

RESTORE_URL="postgresql://postgres:t@localhost:55432/postgres" \
  bash "$HERE/restore-check.sh" "$WORK/test.dump"

rows="$(psql "postgresql://postgres:t@localhost:55432/postgres" -Atc 'SELECT count(*) FROM tenant_test.appointment')"
[ "$rows" = 1 ] || { echo "FAIL: expected 1 restored appointment row, got $rows"; exit 1; }
echo "PASS: dump with btree_gist + ltree restores"
