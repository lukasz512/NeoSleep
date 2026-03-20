/**
 * Shared language options for all apps (rep-app, website, etc.).
 * Single source of truth: id, labelKey (i18n), nativeLabel (for selector display), flag emoji.
 */
export type LocaleId = "en" | "pl" | "mx";

export const LANGUAGE_OPTIONS: {
  id: LocaleId;
  labelKey: string;
  nativeLabel: string;
  flag: string;
}[] = [
  { id: "en", labelKey: "app.language.en", nativeLabel: "English", flag: "🇬🇧" },
  { id: "pl", labelKey: "app.language.pl", nativeLabel: "Polski", flag: "🇵🇱" },
  { id: "mx", labelKey: "app.language.mx", nativeLabel: "Español (MX)", flag: "🇲🇽" },
];
