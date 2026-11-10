-- Replaces all patient / practitioner / lead / clinic personal data in a restored
-- copy of the production database (CORE-189). Run it on the staging copy before it
-- reaches the dev database, never on production (refresh.sh guards the target).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f anonymize.sql   [-v keep_domain=neosleepcare.com]
--
-- Kept: identities whose email is on keep_domain (staff, QA and test accounts), so
-- pwa-dev logins keep working. Everything else is replaced with deterministic fake
-- values (see helpers.sql), free text is blanked, audit snapshots and partner
-- payloads are dropped, and session/login tokens are deleted. Clinical answers
-- (questionnaires, exams, study numbers) stay: without a name they identify no one.
--
-- Works across schema drift: a table or column missing in some tenant is skipped.
-- pii-check.sql verifies the result; keep both files in step.
\ir helpers.sql

-- UPDATE s.t AS x SET <col = expr, ...> WHERE <cond>, for the columns that exist.
CREATE OR REPLACE FUNCTION pg_temp.scrub(s text, t text, sets jsonb, cond text DEFAULT 'true')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  parts text[];
  col text;
  expr text;
BEGIN
  IF to_regclass(format('%I.%I', s, t)) IS NULL THEN RETURN; END IF;
  FOR col, expr IN SELECT key, value FROM jsonb_each_text(sets) LOOP
    IF pg_temp.has_column(s, t, col) THEN
      parts := parts || format('%I = %s', col, expr);
    END IF;
  END LOOP;
  IF parts IS NULL THEN RETURN; END IF;
  EXECUTE format('UPDATE %I.%I AS x SET %s WHERE %s', s, t, array_to_string(parts, ', '),
                 replace(cond, '{s}', quote_ident(s)));
END $$;

CREATE OR REPLACE FUNCTION pg_temp.wipe(s text, t text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(format('%I.%I', s, t)) IS NOT NULL THEN
    EXECUTE format('DELETE FROM %I.%I', s, t);
  END IF;
END $$;

DO $$
DECLARE
  s text;
  -- Row belongs to a person who is not an internal account.
  not_kept constant text :=
    'NOT EXISTS (SELECT 1 FROM {s}.identities k WHERE k.id = x.identity_id AND pg_temp.is_kept_email(k.email))';
BEGIN
  FOR s IN SELECT * FROM pg_temp.tenant_schemas() LOOP
    RAISE NOTICE 'anonymizing %', s;

    -- People
    PERFORM pg_temp.scrub(s, 'identities', jsonb_build_object(
      'first_name',     'CASE WHEN x.first_name IS NULL THEN NULL ELSE pg_temp.pick(pg_temp.fake_first_names(), x.id::text) END',
      'last_name',      'CASE WHEN x.last_name IS NULL THEN NULL ELSE pg_temp.pick(pg_temp.fake_last_names(), x.id::text) END',
      'preferred_name', 'NULL',
      'email',          'CASE WHEN x.email IS NULL THEN NULL ELSE pg_temp.fake_email(x.id::text) END',
      'phone',          'CASE WHEN x.phone IS NULL THEN NULL ELSE pg_temp.fake_phone(x.id::text) END',
      'date_of_birth',  'CASE WHEN x.date_of_birth IS NULL THEN NULL ELSE make_date(extract(year FROM x.date_of_birth)::int, 1, 1) END',
      'social_links', 'DEFAULT',
      'avatar_url',     'NULL',
      'notes',          'NULL',
      'metadata',       'x.metadata - ARRAY[''billing_address'',''clinic_email'',''clinic_name'',''clinic_phone'',''tax_id'']'
    ), 'NOT pg_temp.is_kept_email(x.email)');

    PERFORM pg_temp.scrub(s, 'users', jsonb_build_object(
      'google_sub',    'NULL',
      'password_hash', 'NULL',
      'login_email',   'CASE WHEN x.login_email IS NULL THEN NULL ELSE pg_temp.fake_email(''login'' || x.id::text) END',
      'work_phone',    'CASE WHEN x.work_phone IS NULL THEN NULL ELSE pg_temp.fake_phone(''work'' || x.id::text) END',
      'bio',           'NULL'
    ), not_kept);

    PERFORM pg_temp.scrub(s, 'patient', jsonb_build_object(
      'google_sub',       'NULL',
      'password_hash',    'NULL',
      'medical_record',   'CASE WHEN x.medical_record IS NULL THEN NULL ELSE ''MR-'' || upper(left(md5(x.id::text), 8)) END',
      'shipping_address', 'CASE WHEN x.shipping_address IS NULL THEN NULL ELSE jsonb_build_object(''line1'', ''Demo Street 1'', ''city'', x.shipping_address->''city'', ''postal_code'', ''00000'', ''country_code'', x.shipping_address->''country_code'') END'
    ), not_kept);

    PERFORM pg_temp.scrub(s, 'practitioner', jsonb_build_object('national_ids', 'DEFAULT'), not_kept);

    PERFORM pg_temp.scrub(s, 'lead', jsonb_build_object(
      'institution', 'CASE WHEN x.institution IS NULL THEN NULL ELSE ''Demo Clinic'' END',
      'metadata',    'x.metadata - ''institution'''
    ), not_kept);

    -- Clinics: small practices are named after (and reachable at) the doctor.
    PERFORM pg_temp.scrub(s, 'organization', jsonb_build_object(
      'name',               '''Demo Clinic '' || upper(left(md5(x.id::text), 4))',
      'address_line1',      'CASE WHEN x.address_line1 IS NULL THEN NULL ELSE ''Demo Street 1'' END',
      'postal_code',        'CASE WHEN x.postal_code IS NULL THEN NULL ELSE ''00000'' END',
      'phone',              'CASE WHEN x.phone IS NULL THEN NULL ELSE pg_temp.fake_phone(x.id::text) END',
      'email',              'CASE WHEN x.email IS NULL THEN NULL ELSE pg_temp.fake_email(x.id::text) END',
      'identifiers', 'DEFAULT',
      'website',            'NULL',
      'google_link',        'NULL',
      'latitude',           'NULL',
      'longitude',          'NULL',
      'visit_instructions', 'NULL'
    ));

    -- Free text and snapshots that can carry names, addresses or contact details
    PERFORM pg_temp.scrub(s, 'note', jsonb_build_object('body', '''Anonymized note.'''));
    PERFORM pg_temp.scrub(s, 'appointment', jsonb_build_object(
      'notes', 'NULL', 'online_url', 'NULL', 'patient_response_note', 'NULL', 'cancel_reason', 'NULL'));
    PERFORM pg_temp.scrub(s, 'encounter', jsonb_build_object(
      'notes', 'NULL', 'next_visit_notes', 'NULL', 'samples_notes', 'NULL', 'next_action', 'NULL',
      'attendees', 'DEFAULT', 'voice_note_url', 'NULL', 'checkin_location', 'DEFAULT', 'metadata', 'DEFAULT'));
    PERFORM pg_temp.scrub(s, 'sleep_study', jsonb_build_object(
      'interpretation', 'CASE WHEN x.interpretation IS NULL THEN NULL ELSE ''Anonymized.'' END',
      'notes',          'NULL',
      'device_serial',  'CASE WHEN x.device_serial IS NULL THEN NULL ELSE ''SN-'' || upper(left(md5(x.id::text), 8)) END'));
    PERFORM pg_temp.scrub(s, 'treatment_plan', jsonb_build_object(
      'notes', 'NULL', 'metadata', 'x.metadata - ARRAY[''orthoapneaDraft'',''orthoapneaOrder'']'));
    PERFORM pg_temp.scrub(s, 'medical_history_questionnaire', jsonb_build_object('medical_history_other', 'NULL'));
    PERFORM pg_temp.scrub(s, 'notification', jsonb_build_object('title', '''Notification''', 'body', 'NULL'));
    PERFORM pg_temp.scrub(s, 'notification_delivery', jsonb_build_object('failed_reason', 'NULL'));
    PERFORM pg_temp.scrub(s, 'patient_email_send', jsonb_build_object('sent_to_masked', '''a***@anon.invalid'''));
    PERFORM pg_temp.scrub(s, 'file_attachment', jsonb_build_object(
      'filename', 'CASE WHEN x.filename IS NULL THEN NULL ELSE ''document-'' || left(md5(x.id::text), 8) || coalesce(substring(x.filename FROM ''\.[A-Za-z0-9]{1,5}$''), '''') END',
      'metadata', 'x.metadata - ARRAY[''uploaded_by_name'',''signatory'',''notes'',''title'']'));
    PERFORM pg_temp.scrub(s, 'consent', jsonb_build_object('metadata', 'x.metadata - ''signatory'''));
    PERFORM pg_temp.scrub(s, 'audit_log', jsonb_build_object(
      'entity_before', 'DEFAULT', 'entity_after', 'DEFAULT', 'user_ip', 'NULL', 'user_agent', 'NULL', 'metadata', 'DEFAULT'));
    PERFORM pg_temp.scrub(s, 'partner_transaction', jsonb_build_object(
      'request_payload', 'DEFAULT', 'response_payload', 'DEFAULT', 'validation_report', 'DEFAULT', 'error_message', 'NULL'));
    PERFORM pg_temp.scrub(s, 'device_order_reconciliation_run', jsonb_build_object('items', 'DEFAULT', 'error', 'NULL'));
    PERFORM pg_temp.scrub(s, 'event_attendee', jsonb_build_object('notes', 'NULL'));

    -- Login material from production must not work against dev, and raw inbound
    -- messages / request logs carry phone numbers, emails and IPs.
    PERFORM pg_temp.wipe(s, t) FROM unnest(ARRAY[
      'remember_me_tokens', 'password_reset_tokens', 'magic_link_tokens', 'user_session',
      'webauthn_credentials', 'patient_webauthn_credentials', 'push_subscription',
      'request_log', 'webhook_event', 'message', 'conversation']) AS t;
  END LOOP;

  -- Platform: error logs and problem reports can quote whatever was on screen.
  PERFORM pg_temp.wipe('platform', 'diagnostics');
  PERFORM pg_temp.scrub('platform', 'problem_report', jsonb_build_object(
    'description',    '''Anonymized report.''',
    'reporter_name',  'CASE WHEN x.reporter_name IS NULL THEN NULL ELSE ''Reporter'' END',
    'reporter_email', 'CASE WHEN x.reporter_email IS NULL OR pg_temp.is_kept_email(x.reporter_email) THEN x.reporter_email ELSE pg_temp.fake_email(x.id::text) END',
    'reporter_reply', 'NULL',
    'admin_note',     'NULL',
    'recent_errors', 'DEFAULT'));
END $$;
