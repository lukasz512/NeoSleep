import { createI18n } from "vue-i18n";
import { REP_STORAGE_KEYS } from "../constants";

/** Detect browser preferred locale, mapped to our supported locales. */
function detectBrowserLocale(): "en" | "pl" | "es" {
  const lang = typeof navigator !== "undefined" ? navigator.language : "";
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("es")) return "es";
  return "en";
}

/**
 * Resolve the initial locale:
 * 1. If the user has explicitly saved a locale preference → use it.
 * 2. If no preference saved yet → detect from browser language.
 */
function resolveInitialLocale(): "en" | "pl" | "es" {
  if (typeof localStorage === "undefined") return detectBrowserLocale();
  try {
    const raw = localStorage.getItem(REP_STORAGE_KEYS.settings);
    if (raw) {
      const parsed = JSON.parse(raw) as { locale?: string };
      if (parsed?.locale === "pl" || parsed?.locale === "es" || parsed?.locale === "en") {
        return parsed.locale;
      }
    }
  } catch {
    // ignore
  }
  return detectBrowserLocale();
}

const savedLocale = resolveInitialLocale();

const localeLoaders: Record<string, () => Promise<Record<string, string>>> = {
  en: () => import("@i18n/en.json").then((m) => m.default),
  pl: () => import("@i18n/pl.json").then((m) => m.default),
  es: () => import("@i18n/es.json").then((m) => m.default),
};

const initialMessages = await localeLoaders[savedLocale]();

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: "en",
  messages: { [savedLocale]: initialMessages },
});

/** Load locale messages on demand before switching i18n.global.locale. */
export async function loadLocale(locale: "en" | "pl" | "es"): Promise<void> {
  if (i18n.global.availableLocales.includes(locale)) return;
  const messages = await localeLoaders[locale]();
  i18n.global.setLocaleMessage(locale, messages);
}

/**
 * Merge DB label overrides on top of static JSON messages.
 * Call this after config loads. Safe to call multiple times (latest overrides win).
 */
export function applyI18nOverrides(overrides: Record<string, Record<string, string>>): void {
  for (const [locale, messages] of Object.entries(overrides)) {
    if (Object.keys(messages).length > 0) {
      i18n.global.mergeLocaleMessage(locale, messages);
    }
  }
}
