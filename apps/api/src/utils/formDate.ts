/**
 * Dates printed on clinical forms (Łukasz, 2026-09-26): always two-digit day
 * and month, four-digit year — "05/09/2026" (dd.mm.yyyy for Polish documents)
 * — in the clinic's time zone, not the server's. es-MX's default short date
 * ("5/9/2026") is what these replace. Legal documents written out in words
 * ("24 września 2026") use partnerDocuments.formatDocumentDate instead.
 */

const FORM_DATE_ZONES: Record<string, { timeZone: string; separator: string }> = {
  pl: { timeZone: "Europe/Warsaw", separator: "." },
  mx: { timeZone: "America/Mexico_City", separator: "/" },
  en: { timeZone: "America/Mexico_City", separator: "/" },
};

function parts(date: Date, locale: string, withTime: boolean): Record<string, string> {
  const { timeZone } = FORM_DATE_ZONES[locale] ?? FORM_DATE_ZONES.mx;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
    timeZone,
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

/** "05/09/2026" (mx, en) or "05.09.2026" (pl). */
export function formatFormDate(date: Date, locale: string): string {
  const { separator } = FORM_DATE_ZONES[locale] ?? FORM_DATE_ZONES.mx;
  const p = parts(date, locale, false);
  return [p.day, p.month, p.year].join(separator);
}

/** "05/09/2026 14:32" — for stamps that say when something happened. */
export function formatFormDateTime(date: Date, locale: string): string {
  const p = parts(date, locale, true);
  return `${formatFormDate(date, locale)} ${p.hour}:${p.minute}`;
}
