-- Session-local helpers shared by anonymize.sql and pii-check.sql (CORE-189).
-- Everything lives in pg_temp, so nothing is left behind in the database.
--
-- Fake values are deterministic (derived from the row id): re-running the
-- anonymizer gives every row the same fake name, so the run is idempotent and
-- links between rows (same person in two tenants) stay readable in dev.

-- Identities with an email on this domain are internal accounts (staff, QA, test
-- doctors) and are kept as they are, so people can still log in to pwa-dev.
-- Override with: psql -v keep_domain=other.com
\if :{?keep_domain}
\else
\set keep_domain neosleepcare.com
\endif
SELECT set_config('anon.keep_domain', :'keep_domain', false) AS keep_domain_setting \gset

CREATE OR REPLACE FUNCTION pg_temp.fake_first_names() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Alex','Andrea','Ariel','Camila','Carmen','Cruz','Dana','Elena','Emilio','Ernesto',
               'Fernanda','Gael','Ines','Irene','Ivan','Julia','Leon','Lucia','Mateo','Nora',
               'Olga','Pablo','Rafael','Rosa','Sara','Teo','Vera','Ximena','Yago','Zoe']
$$;

CREATE OR REPLACE FUNCTION pg_temp.fake_last_names() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Demo','Sample','Example','Placeholder','Testcase','Mockup','Prototype','Specimen',
               'Fixture','Dummy']
$$;

-- Picks a stable element of `pool` for `seed`.
CREATE OR REPLACE FUNCTION pg_temp.pick(pool text[], seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT pool[1 + abs(hashtext(seed)) % array_length(pool, 1)]
$$;

CREATE OR REPLACE FUNCTION pg_temp.fake_email(seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'anon-' || left(md5(seed), 12) || '@anon.invalid'
$$;

-- +52 000 ... : area code 000 does not exist, so the number can never ring anyone.
CREATE OR REPLACE FUNCTION pg_temp.fake_phone(seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT '+52000' || lpad((abs(hashtext(seed)) % 1000000)::text, 6, '0')
$$;

CREATE OR REPLACE FUNCTION pg_temp.is_kept_email(email text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT email IS NOT NULL AND lower(email) LIKE '%@' || lower(current_setting('anon.keep_domain'))
$$;

-- Tenant schemas = every schema with an identities table.
CREATE OR REPLACE FUNCTION pg_temp.tenant_schemas() RETURNS SETOF text LANGUAGE sql STABLE AS $$
  SELECT table_schema::text FROM information_schema.tables
  WHERE table_name = 'identities' AND table_type = 'BASE TABLE'
    AND table_schema NOT IN ('platform', 'public', 'auth', 'storage')
  ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_column(s text, t text, c text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = s AND table_name = t AND column_name = c)
$$;

-- True when a JSON/array value holds something (column defaults are '{}' or '[]').
CREATE OR REPLACE FUNCTION pg_temp.filled(v anyelement) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NOT NULL AND v::text NOT IN ('{}', '[]', 'null')
$$;
