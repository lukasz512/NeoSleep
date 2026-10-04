/**
 * The bell's list (CORE-4): which group a notification sits in, how its time
 * reads, what the badge says and when a swipe marks it read. Pure functions,
 * native Intl only (no date library in the PWA), so the rules are tested on
 * their own and AppNotificationCenter only renders them.
 */

export type NotificationActionKind = "call" | "reschedule";

export interface NotificationAction {
  kind: NotificationActionKind;
  href: string;
}

/** The fields the grouping needs; CenterNotification carries more. */
export interface FeedItem {
  id: string;
  createdAt: string;
  readAt: string | null;
  actions: NotificationAction[];
}

export type FeedGroupKey = "needsAction" | "today" | "yesterday" | "earlier";

export interface FeedGroup<T extends FeedItem> {
  key: FeedGroupKey;
  items: T[];
}

const GROUP_ORDER: readonly FeedGroupKey[] = ["needsAction", "today", "yesterday", "earlier"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 86_400_000;

/**
 * Needs action (unread, with quick actions — CORE-4 D2) on top, then Today,
 * Yesterday and Earlier by the user's local day. Empty groups are left out;
 * each group lists the newest first.
 */
export function groupNotifications<T extends FeedItem>(items: readonly T[], now: Date = new Date()): FeedGroup<T>[] {
  const today = startOfDay(now);
  const buckets = new Map<FeedGroupKey, T[]>(GROUP_ORDER.map((k) => [k, []]));
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const item of sorted) {
    let key: FeedGroupKey;
    if (!item.readAt && item.actions.length > 0) key = "needsAction";
    else {
      const day = startOfDay(new Date(item.createdAt));
      key = day >= today ? "today" : day >= today - DAY_MS ? "yesterday" : "earlier";
    }
    buckets.get(key)!.push(item);
  }
  return GROUP_ORDER.filter((k) => buckets.get(k)!.length > 0).map((key) => ({ key, items: buckets.get(key)! }));
}

export interface TimeLabels {
  now: string;
  minutes: (n: number) => string;
}

/**
 * "now" under a minute, "12 min" under an hour, the clock time for the rest
 * of today, then a short date ("3 Oct"; with the year when it differs).
 * `bcp47` is the Intl locale (e.g. "es-MX" for the app's `mx`).
 */
export function formatNotificationTime(iso: string, now: Date, bcp47: string, labels: TimeLabels): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return labels.now;
  if (diffMin < 60) return labels.minutes(diffMin);
  if (startOfDay(d) === startOfDay(now)) {
    return d.toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  return d.toLocaleDateString(bcp47, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** The bell's badge: nothing at 0, the count up to 9, then "9+". */
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

/** Phone: a row swiped this far left (px) marks the notification read. */
export const SWIPE_READ_DISTANCE = 72;

/** What a released horizontal swipe does: mark read, or spring back. */
export function swipeOutcome(dx: number): "read" | "back" {
  return dx <= -SWIPE_READ_DISTANCE ? "read" : "back";
}

/** The app's locale ids → Intl locales (`mx` is es-MX, see CLAUDE.md). */
const INTL_LOCALES: Record<string, string> = { en: "en-GB", pl: "pl-PL", mx: "es-MX" };

export function intlLocaleFor(locale: string): string {
  return INTL_LOCALES[locale] ?? locale;
}
