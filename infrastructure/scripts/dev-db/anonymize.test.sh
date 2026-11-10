#!/usr/bin/env bash
# Regression test for anonymize.sql + pii-check.sql (CORE-189), against the real,
# migrated tenant schema (not a hand-written copy that could drift).
#
# Plants recognisable personal data in a fresh tenant schema, checks that
# pii-check.sql fails on it, anonymizes, then checks that pii-check.sql passes,
# that none of the planted strings is left anywhere in a data dump of the schema,
# and that the internal (keep_domain) account is untouched.
#
# Usage: bash infrastructure/scripts/dev-db/anonymize.test.sh
#   Needs the worktree test database (pnpm test-db up --migrate) or TEST_DATABASE_URL.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:${TEST_DB_PORT:-54329}/$(bash "$HERE/../test-db.sh" dbname)}"
SCHEMA=anon_test
fail() { echo "FAIL: $*"; exit 1; }
sql() { psql "$URL" -v ON_ERROR_STOP=1 -qAt "$@"; }

sql -c "DROP SCHEMA IF EXISTS $SCHEMA CASCADE" -c "SELECT create_tenant_schema('$SCHEMA')" >/dev/null
trap 'sql -c "DROP SCHEMA IF EXISTS $SCHEMA CASCADE" >/dev/null 2>&1 || true' EXIT

sql -c "SET search_path = $SCHEMA, public" -f "$HERE/pii-fixture.sql"

PLANTED="$(sed -n 's/^-- planted: //p' "$HERE/pii-fixture.sql")"

# Scope the check to the planted schema only, so other tenants in the test DB don't matter.
only_test_schema="CREATE OR REPLACE FUNCTION pg_temp.tenant_schemas() RETURNS SETOF text LANGUAGE sql AS \$\$ SELECT '$SCHEMA'::text \$\$;"
check() { { cat "$HERE/pii-check.sql"; } | sed "s|^\\\\ir helpers.sql|\\\\ir $HERE/helpers.sql\n$only_test_schema|" | psql "$URL" -v ON_ERROR_STOP=1 -qAt 2>&1; }
anonymize() { sed "s|^\\\\ir helpers.sql|\\\\ir $HERE/helpers.sql\n$only_test_schema|" "$HERE/anonymize.sql" | psql "$URL" -v ON_ERROR_STOP=1 -qAt; }

out="$(check)" && fail "pii-check passed on raw data"
grep -q "real first name" <<<"$out" || fail "pii-check did not name the failing rule: $out"
echo "ok: pii-check fails on raw data"

anonymize
anonymize  # idempotent: a second run must not break anything

out="$(check)" || fail "pii-check still fails after anonymize: $out"
echo "ok: pii-check passes after anonymize"

left="$(pg_dump "$URL" --data-only --schema="$SCHEMA" 2>/dev/null | grep -Eo "$PLANTED" | grep -v -i staffina | sort -u || true)"
[ -z "$left" ] || fail "planted personal data still in the dump: $left"
echo "ok: no planted personal data left in the schema"

staff="$(sql -c "SELECT first_name || ' ' || email || ' ' || phone || ' ' || date_of_birth FROM $SCHEMA.identities WHERE id = '00000000-0000-0000-0000-000000000003'")"
[ "$staff" = "Staffina staffina@neosleepcare.com +48600111222 1990-05-05" ] || fail "internal account changed: $staff"
staff_pw="$(sql -c "SELECT password_hash FROM $SCHEMA.users WHERE id = '00000000-0000-0000-0000-0000000000b3'")"
[ "$staff_pw" = "bcrypt-staff-hash" ] || fail "internal account lost its password"
echo "ok: internal account kept"

city="$(sql -c "SELECT shipping_address->>'city' FROM $SCHEMA.patient")"
[ "$city" = Guadalajara ] || fail "patient city should stay for dev realism, got $city"
echo "PASS: anonymize.sql + pii-check.sql"
