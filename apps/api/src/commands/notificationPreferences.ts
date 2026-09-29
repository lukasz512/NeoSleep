import type { TenantContext } from "../context/TenantContext.js";
import { getIdentityIdForUser } from "../db/notification.js";
import {
  upsertNotificationPreference,
  getNotificationSettings,
  upsertNotificationSettings,
  getTenantNotificationDefaults,
  setTenantNotificationDefaults,
  type NotificationDefaults,
} from "../db/notificationPreference.js";
import { insertAuditLog } from "../db.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { CONFIGURABLE_CHANNELS, isLockedCategory } from "../notifications/preferences.js";
import { PREFERENCE_CATEGORIES } from "../queries/notificationPreferences.js";

/**
 * COMMANDS — notification preferences (CORE-2, ADR-027 §3).
 *
 * Security and legal can't be switched off (ADR-012 opt-out table): a PUT
 * that tries is rejected, not silently ignored, so the screen can't drift
 * from what the engine does. Changes are audited — a user or admin muting a
 * channel changes who hears about clinical events.
 */

export interface PreferenceInput {
  category?: unknown;
  channel?: unknown;
  enabled?: unknown;
}

export interface SettingsInput {
  quiet_enabled?: unknown;
  quiet_from?: unknown;
  quiet_to?: unknown;
  digest_enabled?: unknown;
  digest_time?: unknown;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parsePreference(p: PreferenceInput): { category: string; channel: string; enabled: boolean } {
  if (typeof p.category !== "string" || !(PREFERENCE_CATEGORIES as readonly string[]).includes(p.category)) {
    throw new ValidationError("Unknown notification category", "category");
  }
  if (typeof p.channel !== "string" || !(CONFIGURABLE_CHANNELS as readonly string[]).includes(p.channel)) {
    throw new ValidationError("Unknown notification channel", "channel");
  }
  if (typeof p.enabled !== "boolean") throw new ValidationError("enabled must be true or false", "enabled");
  if (isLockedCategory(p.category) && !p.enabled) {
    throw new ValidationError("Security and legal notifications can't be turned off", "category");
  }
  return { category: p.category, channel: p.channel, enabled: p.enabled };
}

function parseTime(value: unknown, field: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !TIME_RE.test(value)) throw new ValidationError("Use HH:MM (24 h)", field);
  return `${value}:00`;
}

function parseBool(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ValidationError(`${field} must be true or false`, field);
  return value;
}

export async function UpdateNotificationPreferencesCommand(
  ctx: TenantContext,
  input: { preferences?: unknown; settings?: unknown }
): Promise<void> {
  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  if (!identityId) throw new NotFoundError("User", ctx.user.id);

  if (input.preferences !== undefined && !Array.isArray(input.preferences)) {
    throw new ValidationError("preferences must be a list", "preferences");
  }
  const prefs = ((input.preferences as PreferenceInput[] | undefined) ?? []).map(parsePreference);

  let settingsAfter: Awaited<ReturnType<typeof getNotificationSettings>> | null = null;
  if (input.settings !== undefined) {
    if (typeof input.settings !== "object" || input.settings === null) throw new ValidationError("settings must be an object", "settings");
    const s = input.settings as SettingsInput;
    const current = await getNotificationSettings(ctx.client, identityId);
    settingsAfter = {
      quiet_enabled: parseBool(s.quiet_enabled, "quiet_enabled", current.quiet_enabled),
      quiet_from: parseTime(s.quiet_from, "quiet_from", current.quiet_from),
      quiet_to: parseTime(s.quiet_to, "quiet_to", current.quiet_to),
      digest_enabled: parseBool(s.digest_enabled, "digest_enabled", current.digest_enabled),
      digest_time: parseTime(s.digest_time, "digest_time", current.digest_time),
    };
  }

  for (const p of prefs) await upsertNotificationPreference(ctx.client, identityId, p);
  if (settingsAfter) await upsertNotificationSettings(ctx.client, identityId, settingsAfter);

  if (prefs.length > 0 || settingsAfter) {
    await insertAuditLog(ctx.client, {
      user_id: ctx.user.id,
      action: "update",
      entity_type: "NotificationPreference",
      entity_id: identityId,
      entity_after: { preferences: prefs, settings: settingsAfter },
      request_id: ctx.requestId,
    });
  }
}

/** Admin: tenant-wide defaults for the same matrix (ADR-027 §3, round 1 D3). */
export async function UpdateTenantNotificationDefaultsCommand(ctx: TenantContext, input: { defaults?: unknown }): Promise<void> {
  if (!Array.isArray(input.defaults)) throw new ValidationError("defaults must be a list", "defaults");
  const parsed = (input.defaults as PreferenceInput[]).map(parsePreference);

  const before = await getTenantNotificationDefaults(ctx.client);
  const after: NotificationDefaults = structuredClone(before);
  for (const p of parsed) {
    const current = after[p.category];
    after[p.category] = { ...(current && typeof current === "object" ? current : {}), [p.channel]: p.enabled };
  }
  await setTenantNotificationDefaults(ctx.client, after);
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "NotificationDefaults",
    entity_before: before,
    entity_after: after,
    request_id: ctx.requestId,
  });
}
