/**
 * Shared language options for all apps (rep-app, website, etc.).
 * Single source of truth: id, labelKey (i18n), flag emoji.
 * Each app filters by its supported locales and renders with its own UI (VSelect, dropdown, etc.).
 */
export type LocaleId = "en" | "pl" | "es";

export const LANGUAGE_OPTIONS: { id: LocaleId; labelKey: string; flag: string }[] = [
  { id: "en", labelKey: "app.language.en", flag: "🇺🇸" },
  { id: "pl", labelKey: "app.language.pl", flag: "🇵🇱" },
  { id: "es", labelKey: "app.language.es", flag: "🇪🇸" },
];
