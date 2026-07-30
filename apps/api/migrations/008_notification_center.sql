-- =============================================================================
-- Migration 008: Notification Center — identity-scoped inbox + per-channel
-- delivery log, and a push_subscription schema/code fix.
--
-- See ADR-012 (docs/ADR-012-notification-center.md) for the full rationale.
-- create_tenant_schema() (001_tenant_schema.sql) already creates the corrected
-- shape for brand-new tenants — this migration patches every tenant schema
-- that already exists, enumerated dynamically from platform.tenants.db_schema
-- (same approach as 006_organization_specialties_and_google_link.sql), so no
-- follow-up fixup is needed regardless of when a new tenant is provisioned.
--
-- No data loss: `notification` and `push_subscription` are both empty in
-- every existing schema (no query/command layer or push subscribe flow ever
-- worked end-to-end before this change — push_subscription's INSERT was
-- broken against the old schema, see ADR-012 §1), so this is a structural
-- fix, not a data migration.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP
    -- notification: user_id -> identity_id (widen the FK target from `users`
    -- to `identities`, the universal TPT base table), drop `channel` (now
    -- tracked per-row in notification_delivery instead).
    EXECUTE format('ALTER TABLE %I.notification DROP COLUMN IF EXISTS user_id', r.db_schema);
    EXECUTE format('ALTER TABLE %I.notification DROP COLUMN IF EXISTS channel', r.db_schema);
    EXECUTE format('ALTER TABLE %I.notification ADD COLUMN IF NOT EXISTS identity_id UUID', r.db_schema);
    EXECUTE format('ALTER TABLE %I.notification ALTER COLUMN identity_id SET NOT NULL', r.db_schema);
    EXECUTE format('ALTER TABLE %I.notification DROP CONSTRAINT IF EXISTS %I', r.db_schema, r.db_schema||'_notification_identity_fk');
    EXECUTE format('
      ALTER TABLE %I.notification
        ADD CONSTRAINT %I FOREIGN KEY (identity_id)
        REFERENCES %I.identities(id) ON DELETE CASCADE',
      r.db_schema, r.db_schema||'_notification_identity_fk', r.db_schema);

    EXECUTE format('DROP INDEX IF EXISTS %I', r.db_schema||'_notif_user_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification (identity_id, read_at)',
      r.db_schema||'_notif_identity_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification (created_at)',
      r.db_schema||'_notif_created_idx', r.db_schema);

    -- notification_delivery: new table, per-channel dispatch log.
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.notification_delivery (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id      UUID        NOT NULL REFERENCES %I.notification(id) ON DELETE CASCADE,
        channel              TEXT        NOT NULL CHECK (channel IN (''in_app'', ''push'', ''email'', ''sms'')),
        status               TEXT        NOT NULL DEFAULT ''pending''
                                CHECK (status IN (''pending'', ''sent'', ''delivered'', ''failed'')),
        provider_message_id  TEXT,
        failed_reason        TEXT,
        sent_at              TIMESTAMPTZ,
        delivered_at         TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification_delivery (notification_id)',
      r.db_schema||'_notif_delivery_notif_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification_delivery (channel, status)',
      r.db_schema||'_notif_delivery_channel_idx', r.db_schema);

    -- push_subscription: p256dh/auth columns -> single `keys` JSONB (matches
    -- the raw Web Push API subscription object, which is what routes/push.ts
    -- actually reads/writes), plus the `last_used` column push.ts updates.
    EXECUTE format('ALTER TABLE %I.push_subscription DROP COLUMN IF EXISTS p256dh', r.db_schema);
    EXECUTE format('ALTER TABLE %I.push_subscription DROP COLUMN IF EXISTS auth', r.db_schema);
    EXECUTE format('ALTER TABLE %I.push_subscription ADD COLUMN IF NOT EXISTS keys JSONB', r.db_schema);
    EXECUTE format('ALTER TABLE %I.push_subscription ADD COLUMN IF NOT EXISTS last_used TIMESTAMPTZ', r.db_schema);
  END LOOP;
END $$;
