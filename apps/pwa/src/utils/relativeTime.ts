/** "3 min ago" / "hace 3 min" in the app's locale. `mx` is the app's internal key for es-MX. */
const INTL_LOCALE: Record<string, string> = { mx: "es-MX" };

const STEPS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 3600 * 1000 },
  { unit: "month", ms: 30 * 24 * 3600 * 1000 },
  { unit: "day", ms: 24 * 3600 * 1000 },
  { unit: "hour", ms: 3600 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

export function formatRelativeTime(iso: string, locale: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale] ?? locale, { numeric: "auto", style: "short" });
  const diff = then - now;
  for (const { unit, ms } of STEPS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, "second");
}
