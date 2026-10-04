/**
 * Pure date + layout helpers for the Calendario day/week/month grids (CORE-122).
 * Everything works on local calendar dates (midnight Date objects) and wall-clock
 * minutes; zone conversion happens once, in CalendarView, via appointmentTime.ts.
 */

/** Sentence case for a formatted date: "octubre de 2026" → "Octubre de 2026" (CSS capitalize would give "De"). */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

export type CalendarViewType = "day" | "week" | "month";

/** Coarse → fine. A move to a higher rank zooms in, to a lower one zooms out. */
const VIEW_RANK: Record<CalendarViewType, number> = { month: 0, week: 1, day: 2 };

export const MINUTES_PER_DAY = 24 * 60;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Monday of `d`'s week — the grid is always Mon–Sun (NEO-104). */
export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

/** "YYYY-MM-DD" of a local date — the same shape as zonedDateKey(). */
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The 42 days (6 weeks, Monday first) a month grid shows for `anchor`'s month. */
export function monthCells(anchor: Date): Date[] {
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** The 7 days of `anchor`'s week. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The days a view shows, as a half-open [start, end) range — what /api/v1/calendar is asked for. */
export function viewWindow(type: CalendarViewType, anchor: Date): { start: Date; end: Date } {
  if (type === "day") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }
  if (type === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  const cells = monthCells(anchor);
  return { start: cells[0]!, end: addDays(cells[41]!, 1) };
}

/** Prev/next: one day, one week or one month (landing on the 1st, as macOS does). */
export function stepAnchor(type: CalendarViewType, anchor: Date, direction: -1 | 1): Date {
  if (type === "day") return addDays(anchor, direction);
  if (type === "week") return addDays(anchor, 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

export type CalendarMotion = "in" | "out" | "next" | "prev" | "none";

/** Which animation a change of view and/or date plays. */
export function calendarMotion(fromType: CalendarViewType, toType: CalendarViewType, fromDate: Date, toDate: Date): CalendarMotion {
  if (VIEW_RANK[toType] > VIEW_RANK[fromType]) return "in";
  if (VIEW_RANK[toType] < VIEW_RANK[fromType]) return "out";
  const a = startOfDay(fromDate).getTime();
  const b = startOfDay(toDate).getTime();
  if (b === a) return "none";
  return b > a ? "next" : "prev";
}

/** "YYYY-MM-DD HH:mm" (toZonedCalendarDateTime) → its day key and minutes since midnight. */
export function parseWallTime(wall: string): { key: string; minutes: number } {
  const [key = "", time = "00:00"] = wall.split(" ");
  const [h = 0, m = 0] = time.split(":").map(Number);
  return { key, minutes: h * 60 + m };
}

export interface TimedItem {
  id: string;
  startMin: number;
  endMin: number;
}

export interface PlacedItem<T extends TimedItem> {
  item: T;
  /** Column inside its overlap group, 0-based. */
  lane: number;
  /** How many columns its overlap group needs. */
  lanes: number;
}

/**
 * Side-by-side columns for overlapping items in one day, like macOS Calendar:
 * items that overlap (directly or through a chain) form a group; each takes
 * the first column free at its start, and the whole group shares one width.
 */
export function layoutDay<T extends TimedItem>(items: readonly T[]): PlacedItem<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: PlacedItem<T>[] = [];
  let group: PlacedItem<T>[] = [];
  let columnsEnd: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const p of group) p.lanes = columnsEnd.length;
    placed.push(...group);
    group = [];
    columnsEnd = [];
  };
  for (const item of sorted) {
    if (group.length && item.startMin >= groupEnd) flush();
    let lane = columnsEnd.findIndex((end) => end <= item.startMin);
    if (lane < 0) {
      lane = columnsEnd.length;
      columnsEnd.push(0);
    }
    columnsEnd[lane] = item.endMin;
    group.push({ item, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  if (group.length) flush();
  return placed;
}

/** A click at `offsetPx` down a column → minutes since midnight, rounded down to `stepMin`. */
export function minutesAtOffset(offsetPx: number, hourHeightPx: number, stepMin = 30): number {
  const raw = (offsetPx / hourHeightPx) * 60;
  const clamped = Math.min(Math.max(raw, 0), MINUTES_PER_DAY - stepMin);
  return Math.floor(clamped / stepMin) * stepMin;
}
