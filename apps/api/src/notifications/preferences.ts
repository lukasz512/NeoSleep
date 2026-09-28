import type { PoolClient } from "pg";
import {
  getNotificationPreferences,
  getNotificationSettings,
  getIdentityTimezone,
  getTenantNotificationDefaults,
  type NotificationDefaults,
  type NotificationPreferenceRow,
  type NotificationSettingsRow,
} from "../db/notificationPreference.js";
import type { NotificationCategory, NotificationChannel, NotificationEventDefinition } from "./catalog.js";

/**
 * Preferences + quiet hours (CORE-2, ADR-027 §3).
 *
 * Which channels a recipient gets for an event:
 *   in_app            always (the inbox is the record of truth)
 *   security, legal   locked: every catalog channel, never deferred (ADR-012 table)
 *   anything else     user row → tenant default → catalog default
 *
 * Quiet hours (default 21:00–07:00 in identities.timezone) hold push/email/
 * sms/whatsapp until the window ends — they are deferred, never dropped.
 */

export const LOCKED_CATEGORIES: readonly NotificationCategory[] = ["security", "legal"];
export const CONFIGURABLE_CHANNELS: readonly NotificationChannel[] = ["push", "email", "sms", "whatsapp"];

export function isLockedCategory(category: string): boolean {
  return (LOCKED_CATEGORIES as readonly string[]).includes(category);
}

export interface ResolvedChannel {
  channel: NotificationChannel;
  /** When the delivery may go out; undefined = now. */
  notBefore?: Date;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * End of the quiet window `now` falls into, or null when `now` is outside it.
 * Windows may cross midnight (21:00–07:00). Minute precision; a DST jump
 * inside the window can shift the end by the jump (acceptable for "don't wake
 * the doctor", ADR-027).
 */
export function quietWindowEnd(now: Date, timeZone: string, from: string, to: string): Date | null {
  const f = minutesOf(from);
  const t = minutesOf(to);
  if (f === t) return null;
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const m = localMinutes(now, zone);
  const inside = f < t ? m >= f && m < t : m >= f || m < t;
  if (!inside) return null;
  const minutesLeft = (t - m + 1440) % 1440;
  const startOfMinute = now.getTime() - (now.getTime() % 60_000);
  return new Date(startOfMinute + minutesLeft * 60_000);
}

/** User row → tenant default for the category → tenant channel-wide default → catalog default (on). */
export function isChannelEnabled(
  category: string,
  channel: NotificationChannel,
  userPrefs: readonly NotificationPreferenceRow[],
  tenantDefaults: NotificationDefaults
): boolean {
  if (isLockedCategory(category)) return true;
  const own = userPrefs.find((p) => p.category === category && p.channel === channel);
  if (own) return own.enabled;
  const perCategory = tenantDefaults[category];
  if (perCategory && typeof perCategory === "object" && typeof perCategory[channel] === "boolean") return perCategory[channel];
  const channelWide = tenantDefaults[channel];
  if (typeof channelWide === "boolean") return channelWide;
  return true;
}

export interface RecipientPreferences {
  prefs: NotificationPreferenceRow[];
  settings: NotificationSettingsRow;
  timeZone: string;
}

export async function loadRecipientPreferences(client: PoolClient, identityId: string): Promise<RecipientPreferences> {
  return {
    prefs: await getNotificationPreferences(client, identityId),
    settings: await getNotificationSettings(client, identityId),
    timeZone: await getIdentityTimezone(client, identityId),
  };
}

export function resolveChannels(
  def: NotificationEventDefinition,
  recipient: RecipientPreferences,
  tenantDefaults: NotificationDefaults,
  now: Date = new Date()
): ResolvedChannel[] {
  const locked = isLockedCategory(def.category);
  const quietEnd =
    !locked && recipient.settings.quiet_enabled
      ? quietWindowEnd(now, recipient.timeZone, recipient.settings.quiet_from, recipient.settings.quiet_to)
      : null;

  const out: ResolvedChannel[] = [{ channel: "in_app" }];
  for (const channel of def.channels) {
    if (channel === "in_app") continue;
    if (!isChannelEnabled(def.category, channel, recipient.prefs, tenantDefaults)) continue;
    out.push(quietEnd ? { channel, notBefore: quietEnd } : { channel });
  }
  return out;
}

export { getTenantNotificationDefaults };
