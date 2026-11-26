/** 2652 → "44:12", 4361 → "1:12:41" — the way video players show length. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "es" → "Spanish" / "español" in the UI language, for screen readers and tooltips; falls back to the code. */
export function languageName(code: string, uiLocale: string): string {
  const tag = uiLocale === "mx" ? "es-MX" : uiLocale;
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
