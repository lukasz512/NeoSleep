-- =============================================================================
-- Migration 056: relink doctor logins split from their practitioner (CORE-173)
--
-- A doctor's login (users) and practitioner record must share one identity
-- (ADR-014). Practitioner/lead writes kept the email as typed while user
-- writes lowercased it, and identities' unique email index is case-sensitive:
-- "Lorena@x.mx" (practitioner) and "lorena@x.mx" (login) became two
-- identities, and the doctor saw no patients (403 on every list).
--
-- Per tenant:
--   1. A doctor login whose identity has no live practitioner is moved onto
--      the ONE practitioner identity with the same email (case/space-
--      insensitive) that no login uses yet. Ambiguous matches are left alone;
--      the API reports those to the admins (services/doctorLinkAlert.ts).
--      The login's identity metadata (invite acceptance) is merged into the
--      practitioner identity; the old identity row stays (nothing deleted,
--      older rows may point at it) but loses its email so it can't collide.
--      One audit_log row per relinked login.
--   2. Every identity email is stored trimmed + lowercased from now on
--      (db/helpers.ts normalizeEmail); existing rows follow, except where
--      lowercasing would collide with another non-shared identity.
--
-- Data only, no tenant DDL, so create_tenant_schema() is not regenerated.
-- Re-run for one schema: SELECT public.relink_doctor_logins('<schema>');
-- ROLLBACK (manual, per tenant): for each audit_log row with
--   metadata->>'migration' = '056', set users.identity_id back to
--   entity_before->>'identity_id' (and restore that identity's email from
--   entity_before->>'email').
-- =============================================================================

-- relink_doctor_logins(schema): the repair for one tenant schema. Kept as a
-- function so the integration test (and an admin, by hand) can run it again.
CREATE OR REPLACE FUNCTION public.relink_doctor_logins(p_schema TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  relinked INT;
  normalized INT;
BEGIN
    IF to_regclass(format('%I.users', p_schema)) IS NULL
       OR to_regclass(format('%I.practitioner', p_schema)) IS NULL THEN
      RETURN;
    END IF;

    EXECUTE format($sql$
      CREATE TEMP TABLE doctor_relink ON COMMIT DROP AS
      WITH cand AS (
        SELECT u.id AS user_id, ui.id AS old_identity, ui.email AS old_email, pi.id AS new_identity,
               count(*) OVER (PARTITION BY u.id) AS n_for_user,
               count(*) OVER (PARTITION BY pi.id) AS n_for_identity
          FROM %1$I.users u
          JOIN %1$I.identities ui ON ui.id = u.identity_id
          JOIN %1$I.identities pi
            ON pi.id <> ui.id
           AND lower(btrim(pi.email)) = lower(btrim(ui.email))
           AND NOT pi.email_shared
          JOIN %1$I.practitioner p ON p.identity_id = pi.id AND p.deleted_at IS NULL
         WHERE u.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM %1$I.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'doctor')
           AND NOT EXISTS (SELECT 1 FROM %1$I.practitioner x WHERE x.identity_id = u.identity_id AND x.deleted_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM %1$I.users y WHERE y.identity_id = pi.id)
      )
      SELECT user_id, old_identity, old_email, new_identity FROM cand
       WHERE n_for_user = 1 AND n_for_identity = 1
    $sql$, p_schema);

    EXECUTE format($sql$
      UPDATE %1$I.identities pi
         SET metadata = CASE WHEN ui.metadata IS NULL THEN pi.metadata
                             ELSE coalesce(pi.metadata, '{}'::jsonb) || ui.metadata END,
             updated_at = now()
        FROM doctor_relink d JOIN %1$I.identities ui ON ui.id = d.old_identity
       WHERE pi.id = d.new_identity
    $sql$, p_schema);

    EXECUTE format($sql$
      UPDATE %1$I.users u SET identity_id = d.new_identity, updated_at = now()
        FROM doctor_relink d WHERE u.id = d.user_id
    $sql$, p_schema);

    EXECUTE format($sql$
      UPDATE %1$I.identities i SET email = NULL, updated_at = now()
        FROM doctor_relink d WHERE i.id = d.old_identity
    $sql$, p_schema);

    EXECUTE format($sql$
      INSERT INTO %1$I.audit_log (action, entity_type, entity_id, entity_before, entity_after, metadata)
      SELECT 'update', 'User', d.user_id::text,
             jsonb_build_object('identity_id', d.old_identity, 'email', d.old_email),
             jsonb_build_object('identity_id', d.new_identity),
             jsonb_build_object('migration', '056', 'ticket', 'CORE-173',
                                'reason', 'doctor login relinked to its practitioner identity')
        FROM doctor_relink d
    $sql$, p_schema);

    EXECUTE 'SELECT count(*) FROM doctor_relink' INTO relinked;
    EXECUTE 'DROP TABLE doctor_relink';

    EXECUTE format($sql$
      UPDATE %1$I.identities i SET email = lower(btrim(i.email)), updated_at = now()
       WHERE i.email IS NOT NULL
         AND i.email <> lower(btrim(i.email))
         AND (i.email_shared OR NOT EXISTS (
               SELECT 1 FROM %1$I.identities o
                WHERE o.id <> i.id AND NOT o.email_shared AND lower(btrim(o.email)) = lower(btrim(i.email))))
    $sql$, p_schema);
    GET DIAGNOSTICS normalized = ROW_COUNT;

    RAISE NOTICE '056 %: % doctor login(s) relinked, % identity email(s) normalized', p_schema, relinked, normalized;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants LOOP
    PERFORM public.relink_doctor_logins(r.db_schema);
  END LOOP;
END $$;
