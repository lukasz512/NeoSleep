-- =============================================================================
-- Migration 018: partner_link + partner_transaction — generic external
-- partner order-sync tracking (OrthoApnea first, 3+ more partners planned).
--
-- partner_link: current-state pointer. One row per (partner, entity_type,
-- entity_id) — does this patient/treatment_plan have an external
-- counterpart, what's its id, what's its last known status. Deliberately
-- generic (plain TEXT `partner` column, not an enum/CHECK) so a second or
-- third partner never needs its own migration.
--
-- partner_transaction: append-only log of every single API call made for a
-- link — exact outbound JSON, exact inbound JSON, HTTP status, success flag,
-- and a validation_report (computed by services/partners/*.ts against a
-- per-action expected-fields baseline) flagging any field OrthoApnea (or a
-- future partner) silently renamed/removed. This is what makes every
-- transaction auditable end-to-end, not just the current state.
--
-- Ordering: a partner_link row is upserted BEFORE the API call is made
-- (external_id NULL, sync_status 'pending'), so even a totally failed first
-- call still has somewhere to attach its partner_transaction row. Read
-- services/partners/orthoapnea.ts for the write sequence.
--
-- Same known gap as 004/005/014/015 (documented there, repeated here rather
-- than re-litigated): this only patches already-provisioned tenant schemas
-- via the DO $$ loop below. create_tenant_schema() is not edited — fold
-- these tables in the next time that function is touched for an unrelated
-- reason.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: both tables must have 0 rows, or an explicit decision to
--   discard the partner sync history (not recoverable after DROP TABLE).
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('DROP TABLE IF EXISTS %I.partner_transaction', r.db_schema);
--       EXECUTE format('DROP TABLE IF EXISTS %I.partner_link', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.partner_link (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        partner           TEXT        NOT NULL,
        entity_type       TEXT        NOT NULL,   -- ''patient'' | ''treatment_plan''
        entity_id         UUID        NOT NULL,
        external_id       TEXT,                   -- nullable: set once the partner returns one (see ordering note above)
        external_status   TEXT,
        sync_status       TEXT        NOT NULL DEFAULT ''pending'' CHECK (sync_status IN (''pending'', ''synced'', ''failed'')),
        last_error        TEXT,
        last_synced_at    TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (partner, entity_type, entity_id)
      )', r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.partner_link (entity_type, entity_id)',
      r.db_schema||'_partner_link_entity_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.partner_link (partner, sync_status)',
      r.db_schema||'_partner_link_sync_idx', r.db_schema);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.partner_transaction (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_link_id    UUID        NOT NULL REFERENCES %I.partner_link(id) ON DELETE CASCADE,
        action             TEXT        NOT NULL,   -- ''create_patient'' | ''create_treatment'' | ''status_poll''
        request_payload    JSONB,
        response_payload   JSONB,
        http_status        INTEGER,
        success            BOOLEAN     NOT NULL,
        validation_report  JSONB,
        error_message      TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.partner_transaction (partner_link_id, created_at DESC)',
      r.db_schema||'_partner_transaction_link_idx', r.db_schema);
  END LOOP;
END $$;
