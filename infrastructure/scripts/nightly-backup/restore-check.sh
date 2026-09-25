#!/usr/bin/env bash
# Proves a fresh pg_dump is actually restorable before it is encrypted and uploaded
# (NEO-62). A backup nobody has restored is not a backup.
#
# Usage: RESTORE_URL=postgresql://... restore-check.sh <dump-file>
#   RESTORE_URL must point at an EMPTY throwaway Postgres (the workflow's service
#   container). Never point it at a real database.
#
# What it checks:
#   - every application schema in the dump restores with --exit-on-error
#   - each restored schema has exactly as many tables as the dump lists for it
# Supabase-internal schemas (auth, storage, realtime, ...) are skipped: they depend
# on Supabase-only roles and extensions that a vanilla Postgres does not have, and
# none of our data lives there. They are still inside the backup file itself.
set -euo pipefail

DUMP="${1:?usage: restore-check.sh <dump-file>}"
: "${RESTORE_URL:?RESTORE_URL must be set}"

SUPABASE_INTERNAL='^(auth|storage|realtime|_realtime|graphql|graphql_public|vault|pgsodium|pgsodium_masks|supabase_functions|supabase_migrations|pgbouncer|net|cron|extensions|_analytics|pgmq|information_schema)$'

TOC="$(mktemp)"
pg_restore --list "$DUMP" > "$TOC"

# TOC line: "<id>; <oid> <oid> SCHEMA - <name> <owner>"
# while-read instead of mapfile: macOS still ships bash 3.2, and the restore
# drill in the runbook runs this locally too.
SCHEMAS=()
while IFS= read -r s; do SCHEMAS+=("$s"); done < <(
  { awk '$4 == "SCHEMA" && $5 == "-" { print $6 }' "$TOC"; echo public; } \
    | grep -Ev "$SUPABASE_INTERNAL" | sort -u
)
if [ "${#SCHEMAS[@]}" -eq 0 ]; then
  echo "FAIL: no application schemas found in dump"
  exit 1
fi
echo "Application schemas: ${SCHEMAS[*]}"

# Our migrations install extensions into Supabase's `extensions` schema.
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS ltree SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
SQL

SCHEMA_ARGS=()
for s in "${SCHEMAS[@]}"; do
  [ "$s" = public ] || psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -q -c "CREATE SCHEMA IF NOT EXISTS \"$s\""
  SCHEMA_ARGS+=(--schema="$s")
done

pg_restore --dbname="$RESTORE_URL" --no-owner --no-privileges --exit-on-error "${SCHEMA_ARGS[@]}" "$DUMP"

FAILED=0
for s in "${SCHEMAS[@]}"; do
  # TOC line: "<id>; <oid> <oid> TABLE <schema> <name> <owner>"
  expected="$(awk -v s="$s" '$4 == "TABLE" && $5 == s' "$TOC" | wc -l | tr -d ' ')"
  actual="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = '$s'")"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL: schema $s — dump lists $expected tables, restored $actual"
    FAILED=1
  else
    echo "OK:   schema $s — $actual tables"
  fi
done

rm -f "$TOC"
exit "$FAILED"
