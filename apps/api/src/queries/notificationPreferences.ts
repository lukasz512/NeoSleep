import type { TenantContext } from "../context/TenantContext.js";
import { getIdentityIdForUser } from "../db/notification.js";
import {
  getNotificationPreferences,
  getNotificationSettings,
  getIdentityTimezone,
  getTenantNotificationDefaults,
  type NotificationDefaults,
} from "../db/notificationPreference.js";
import { NotFoundError } from "../errors.js";
import { CONFIGURABLE_CHANNELS, isChannelEnabled, isLockedCategory } from "../notifications/preferences.js";

/**
 * QUERIES — notification preferences (CORE-2). What the preferences screen
 * (CORE-7) renders: the effective value of every category × channel, with the
 * locked categories marked, plus quiet hours and digest settings.
 */

export const PREFERENCE_CATEGORIES = ["operational", "marketing", "security", "legal"] as const;

export interface NotificationPreferencesDto {
  categories: Array<{ category: string; locked: boolean; channels: Record<string, boolean> }>;
  settings: { quiet_enabled: boolean; quiet_from: string; quiet_to: string; digest_enabled: boolean; digest_time: string };
  timezone: string;
}

const hhmm = (t: string): string => t.slice(0, 5);

export function effectiveMatrix(
  prefs: Parameters<typeof isChannelEnabled>[2],
  defaults: NotificationDefaults
): NotificationPreferencesDto["categories"] {
  return PREFERENCE_CATEGORIES.map((category) => ({
    category,
    locked: isLockedCategory(category),
    channels: Object.fromEntries(CONFIGURABLE_CHANNELS.map((ch) => [ch, isChannelEnabled(category, ch, prefs, defaults)])),
  }));
}

export async function GetNotificationPreferencesQuery(ctx: TenantContext): Promise<NotificationPreferencesDto> {
  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  if (!identityId) throw new NotFoundError("User", ctx.user.id);

  const prefs = await getNotificationPreferences(ctx.client, identityId);
  const defaults = await getTenantNotificationDefaults(ctx.client);
  const settings = await getNotificationSettings(ctx.client, identityId);
  return {
    categories: effectiveMatrix(prefs, defaults),
    settings: {
      quiet_enabled: settings.quiet_enabled,
      quiet_from: hhmm(settings.quiet_from),
      quiet_to: hhmm(settings.quiet_to),
      digest_enabled: settings.digest_enabled,
      digest_time: hhmm(settings.digest_time),
    },
    timezone: await getIdentityTimezone(ctx.client, identityId),
  };
}

export async function GetTenantNotificationDefaultsQuery(ctx: TenantContext): Promise<NotificationPreferencesDto["categories"]> {
  return effectiveMatrix([], await getTenantNotificationDefaults(ctx.client));
}
