/**
 * "25.09.2026" + "3 days ago": a date and how long ago it was, both through
 * Intl so they follow the app locale (pass intlLocale(locale), e.g. "es-MX")
 * without any per-language strings of our own. Used by the doctor's patient
 * list "Last updated" column (NEO-57).
 */

const DAY_MS = 86_400_000;

export function formatDateShort(iso: string | null | undefined, bcp47: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(bcp47);
}

/** Largest sensible unit: today/yesterday → days → weeks → months → years. */
export function formatRelativeToNow(iso: string | null | undefined, bcp47: string, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const rtf = new Intl.RelativeTimeFormat(bcp47, { numeric: "auto" });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / DAY_MS);
  const abs = Math.abs(days);
  if (abs < 7) return rtf.format(days, "day");
  if (abs < 30) return rtf.format(Math.round(days / 7), "week");
  if (abs < 365) return rtf.format(Math.round(days / 30), "month");
  return rtf.format(Math.round(days / 365), "year");
}
