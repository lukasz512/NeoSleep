-- =============================================================================
-- Migration 009: Partner/doctor invite flow — lead.type, invite_tokens, and
-- consent widened to cover `users` (doctor accounts).
--
-- Backs the new online partner-onboarding flow: staff invites a doctor-type
-- Lead to register, the doctor sets a password + clinic/invoice data and
-- signs GDPR + the partner agreement (handwritten signature captured as an
-- image), and those signed documents become compliance records.
--
-- Four independent changes:
--   1. `lead.type` TEXT column (doctor/hospital/pharmacy/patient/other) —
--      lets LeadsView.vue show a "Zaproś do współpracy" action only for
--      doctor-type leads, the trigger point for the new invite flow.
--   2. Widen `lead.converted_to_type` CHECK to allow 'user' — an accepted
--      doctor invite converts the Lead straight to a `users` row
--      (role='doctor', see 004_first_staff_users.sql precedent), not to
--      `practitioner`.
--   3. Widen `consent.entity_type` CHECK to allow 'user' — so the GDPR/
--      agreement consent captured at registration can reference the new
--      doctor `users` row (previously only practitioner/patient/lead).
--   4. `invite_tokens` table — same shape as `password_reset_tokens` /
--      `magic_link_tokens` (hashed token, expiry, single-use), but models a
--      first-time-registration invite rather than a password reset: longer
--      TTL, optional `lead_id` link back to the originating Lead.
--
-- Known gap (same tradeoff 004/005_...sql documented): the live
-- create_tenant_schema() definition (redefined in
-- 003_practitioner_drop_duplicate_salutation.sql) is NOT updated here — a
-- brand-new tenant provisioned after this migration would need the same
-- fixup re-applied. Not fixed here, per CLAUDE.md's "never mutate old
-- migrations" rule and the same reasoning 004/005 gave: no new tenant is
-- being provisioned right now, and hand-editing that ~1900-line function
-- risks transcription errors for no immediate benefit.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  con RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    -- ---------------------------------------------------------------------
    -- 1. lead.type
    -- ---------------------------------------------------------------------
    EXECUTE format(
      'ALTER TABLE %I.lead ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT ''other''',
      r.db_schema
    );

    EXECUTE format('ALTER TABLE %I.lead DROP CONSTRAINT IF EXISTS lead_type_check', r.db_schema);
    EXECUTE format(
      'ALTER TABLE %I.lead ADD CONSTRAINT lead_type_check CHECK (type IN (''doctor'', ''hospital'', ''pharmacy'', ''patient'', ''other''))',
      r.db_schema
    );

    -- ---------------------------------------------------------------------
    -- 2. widen lead.converted_to_type CHECK to add 'user'
    -- ---------------------------------------------------------------------
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relname = 'lead' AND n.nspname = r.db_schema
        AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%converted_to_type%'
    LOOP
      EXECUTE format('ALTER TABLE %I.lead DROP CONSTRAINT %I', r.db_schema, con.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE %I.lead ADD CONSTRAINT lead_converted_to_type_check CHECK (converted_to_type IN (''practitioner'', ''organization'', ''patient'', ''user'', NULL))',
      r.db_schema
    );

    -- ---------------------------------------------------------------------
    -- 3. widen consent.entity_type CHECK to add 'user'
    -- ---------------------------------------------------------------------
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relname = 'consent' AND n.nspname = r.db_schema
        AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%entity_type%'
    LOOP
      EXECUTE format('ALTER TABLE %I.consent DROP CONSTRAINT %I', r.db_schema, con.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE %I.consent ADD CONSTRAINT consent_entity_type_check CHECK (entity_type IN (''practitioner'', ''patient'', ''lead'', ''user''))',
      r.db_schema
    );

    -- ---------------------------------------------------------------------
    -- 4. invite_tokens
    -- ---------------------------------------------------------------------
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.invite_tokens (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
        lead_id    UUID REFERENCES %I.lead(id) ON DELETE SET NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ,
        created_by UUID REFERENCES %I.users(id) ON DELETE SET NULL,
        metadata   JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.invite_tokens (user_id)',
      r.db_schema || '_invite_tokens_user_idx', r.db_schema);
  END LOOP;
END $$;
