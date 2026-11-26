import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import { timezoneForCountry } from "../utils/timezones.js";

/**
 * Notification preferences + quiet hours (CORE-2, ADR-027 §3).
 * Resolution (user → tenant default → catalog) lives in notifications/preferences.ts.
 */

export interface NotificationPreferenceRow {
  category: string;
  channel: string;
  enabled: boolean;
}

export interface NotificationSettingsRow {
  quiet_enabled: boolean;
  quiet_from: string; // "HH:MM:SS"
  quiet_to: string;
  digest_enabled: boolean;
  digest_time: string;
}

/**
 * Tenant defaults (app_config.notification_defaults). Two shapes coexist:
 *   {"<category>": {"<channel>": bool}}  — per category (CORE-2)
 *   {"<channel>": bool}                   — channel-wide, as seeded by 002_seed.sql
 * The resolver prefers the per-category value, then the channel-wide one.
 */
export type NotificationDefaults = Record<string, Record<string, boolean> | boolean>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsRow = {
  quiet_enabled: true,
  quiet_from: "21:00:00",
  quiet_to: "07:00:00",
  digest_enabled: true,
  digest_time: "07:00:00",
};

export async function getNotificationPreferences(client: PoolClient, identityId: string): Promise<NotificationPreferenceRow[]> {
  try {
    const { rows } = await client.query<NotificationPreferenceRow>(
      "SELECT category, channel, enabled FROM notification_preference WHERE identity_id = $1",
      [identityId]
    );
    return rows;
  } catch (err) {
    throw new DatabaseError("getNotificationPreferences", err);
  }
}

export async function upsertNotificationPreference(
  client: PoolClient,
  identityId: string,
  pref: NotificationPreferenceRow
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO notification_preference (identity_id, category, channel, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (identity_id, category, channel) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [identityId, pref.category, pref.channel, pref.enabled]
    );
  } catch (err) {
    throw new DatabaseError("upsertNotificationPreference", err);
  }
}

export async function getNotificationSettings(client: PoolClient, identityId: string): Promise<NotificationSettingsRow> {
  try {
    const { rows } = await client.query<NotificationSettingsRow>(
      `SELECT quiet_enabled, quiet_from::text, quiet_to::text, digest_enabled, digest_time::text
         FROM notification_settings WHERE identity_id = $1`,
      [identityId]
    );
    return rows[0] ?? DEFAULT_NOTIFICATION_SETTINGS;
  } catch (err) {
    throw new DatabaseError("getNotificationSettings", err);
  }
}

export async function upsertNotificationSettings(
  client: PoolClient,
  identityId: string,
  settings: NotificationSettingsRow
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO notification_settings (identity_id, quiet_enabled, quiet_from, quiet_to, digest_enabled, digest_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (identity_id) DO UPDATE SET
         quiet_enabled = EXCLUDED.quiet_enabled, quiet_from = EXCLUDED.quiet_from, quiet_to = EXCLUDED.quiet_to,
         digest_enabled = EXCLUDED.digest_enabled, digest_time = EXCLUDED.digest_time, updated_at = now()`,
      [identityId, settings.quiet_enabled, settings.quiet_from, settings.quiet_to, settings.digest_enabled, settings.digest_time]
    );
  } catch (err) {
    throw new DatabaseError("upsertNotificationSettings", err);
  }
}

/**
 * The recipient's IANA zone. identities.timezone defaults to 'UTC' and is
 * rarely set, so 'UTC' there means "unknown": fall back to the identity's
 * country, then the tenant's app_config.timezone, then UTC.
 */
export async function getIdentityTimezone(client: PoolClient, identityId: string): Promise<string> {
  try {
    const { rows } = await client.query<{ timezone: string | null; country_code: string | null; tenant_tz: string | null }>(
      `SELECT i.timezone, i.country_code, (SELECT timezone FROM app_config LIMIT 1) AS tenant_tz
         FROM identities i WHERE i.id = $1`,
      [identityId]
    );
    const row = rows[0];
    if (row?.timezone && row.timezone !== "UTC") return row.timezone;
    return timezoneForCountry(row?.country_code) ?? (row?.tenant_tz || "UTC");
  } catch (err) {
    throw new DatabaseError("getIdentityTimezone", err);
  }
}

export async function getTenantNotificationDefaults(client: PoolClient): Promise<NotificationDefaults> {
  try {
    const { rows } = await client.query<{ notification_defaults: NotificationDefaults | null }>(
      "SELECT notification_defaults FROM app_config LIMIT 1"
    );
    return rows[0]?.notification_defaults ?? {};
  } catch (err) {
    throw new DatabaseError("getTenantNotificationDefaults", err);
  }
}

export async function setTenantNotificationDefaults(client: PoolClient, defaults: NotificationDefaults): Promise<void> {
  try {
    const json = JSON.stringify(defaults);
    const { rowCount } = await client.query("UPDATE app_config SET notification_defaults = $1::jsonb", [json]);
    // A tenant without its app_config row (e.g. a freshly cloned schema) gets one — every other column has a default.
    if (!rowCount) await client.query("INSERT INTO app_config (notification_defaults) VALUES ($1::jsonb)", [json]);
  } catch (err) {
    throw new DatabaseError("setTenantNotificationDefaults", err);
  }
}
