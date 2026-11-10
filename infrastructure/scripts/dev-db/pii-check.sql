-- Fails (psql exits non-zero) if the database still holds personal data that
-- anonymize.sql should have replaced (CORE-189). Run it after every refresh of the
-- dev database:
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f pii-check.sql   [-v keep_domain=neosleepcare.com]
--
-- Prints one line per failed rule with its row count, then raises.
\ir helpers.sql

DO $$
DECLARE
  s text;
  t text;
  rule text;
  sql text;
  n bigint;
  failures text[] := '{}';
  not_kept constant text :=
    'NOT EXISTS (SELECT 1 FROM {s}.identities k WHERE k.id = x.identity_id AND pg_temp.is_kept_email(k.email))';
  -- table, rule name, predicate that is true for a row still holding personal data
  rules constant text[][] := ARRAY[
    ['identities', 'real first name',  'NOT pg_temp.is_kept_email(x.email) AND x.first_name IS NOT NULL AND x.first_name <> ALL (pg_temp.fake_first_names())'],
    ['identities', 'real last name',   'NOT pg_temp.is_kept_email(x.email) AND x.last_name IS NOT NULL AND x.last_name <> ALL (pg_temp.fake_last_names())'],
    ['identities', 'real email',       'x.email IS NOT NULL AND NOT pg_temp.is_kept_email(x.email) AND x.email NOT LIKE ''anon-%@anon.invalid'''],
    ['identities', 'real phone',       'NOT pg_temp.is_kept_email(x.email) AND x.phone IS NOT NULL AND x.phone NOT LIKE ''+52000%'''],
    ['identities', 'exact birth date', 'NOT pg_temp.is_kept_email(x.email) AND x.date_of_birth IS NOT NULL AND to_char(x.date_of_birth, ''MM-DD'') <> ''01-01'''],
    ['identities', 'free text',        'NOT pg_temp.is_kept_email(x.email) AND (x.preferred_name IS NOT NULL OR x.notes IS NOT NULL OR x.avatar_url IS NOT NULL OR pg_temp.filled(x.social_links))'],
    ['identities', 'clinic contact',   'NOT pg_temp.is_kept_email(x.email) AND x.metadata ?| ARRAY[''billing_address'',''clinic_email'',''clinic_name'',''clinic_phone'',''tax_id'']'],
    ['users',      'login material',   'NOT_KEPT AND (x.password_hash IS NOT NULL OR x.google_sub IS NOT NULL)'],
    ['patient',    'login material',   'NOT_KEPT AND (x.password_hash IS NOT NULL OR x.google_sub IS NOT NULL)'],
    ['patient',    'real address',     'NOT_KEPT AND x.shipping_address IS NOT NULL AND x.shipping_address->>''line1'' IS DISTINCT FROM ''Demo Street 1'''],
    ['practitioner', 'national id',    'NOT_KEPT AND pg_temp.filled(x.national_ids)'],
    ['organization', 'real name',      'x.name NOT LIKE ''Demo Clinic %'''],
    ['organization', 'real contact',   '(x.email IS NOT NULL AND x.email NOT LIKE ''anon-%@anon.invalid'') OR (x.phone IS NOT NULL AND x.phone NOT LIKE ''+52000%'') OR pg_temp.filled(x.identifiers)'],
    ['note',       'free text',        'x.body <> ''Anonymized note.'''],
    ['notification', 'free text',      'x.body IS NOT NULL'],
    ['audit_log',  'entity snapshot',  'pg_temp.filled(x.entity_before) OR pg_temp.filled(x.entity_after) OR x.user_ip IS NOT NULL'],
    ['partner_transaction', 'payload', 'pg_temp.filled(x.request_payload) OR pg_temp.filled(x.response_payload)'],
    ['remember_me_tokens',    'token', 'true'],
    ['password_reset_tokens', 'token', 'true'],
    ['magic_link_tokens',     'token', 'true'],
    ['webauthn_credentials',  'token', 'true']
  ];
  i int;
BEGIN
  FOR s IN SELECT * FROM pg_temp.tenant_schemas() LOOP
    FOR i IN 1 .. array_length(rules, 1) LOOP
      t := rules[i][1];
      rule := rules[i][2];
      IF to_regclass(format('%I.%I', s, t)) IS NULL THEN CONTINUE; END IF;
      sql := format('SELECT count(*) FROM %I.%I AS x WHERE %s', s, t,
                    replace(replace(rules[i][3], 'NOT_KEPT', not_kept), '{s}', quote_ident(s)));
      BEGIN
        EXECUTE sql INTO n;
      EXCEPTION WHEN undefined_column THEN
        CONTINUE;  -- older tenant schema without that column
      END;
      IF n > 0 THEN
        failures := failures || format('%s.%s: %s (%s rows)', s, t, rule, n);
      END IF;
    END LOOP;
  END LOOP;

  IF to_regclass('platform.diagnostics') IS NOT NULL THEN
    SELECT count(*) INTO n FROM platform.diagnostics;
    IF n > 0 THEN failures := failures || format('platform.diagnostics: error log (%s rows)', n); END IF;
  END IF;

  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION E'PII check FAILED:\n  %', array_to_string(failures, E'\n  ');
  END IF;
  RAISE NOTICE 'PII check passed for schemas: %', (SELECT string_agg(x, ', ') FROM pg_temp.tenant_schemas() x);
END $$;
