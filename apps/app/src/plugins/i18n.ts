import { createI18n } from "vue-i18n";
import { en as vuetifyEn, pl as vuetifyPl, es as vuetifyEs } from "vuetify/locale";
import { REP_STORAGE_KEYS } from "../constants";

/** Detect browser preferred locale, mapped to our supported locales. */
function detectBrowserLocale(): "en" | "pl" | "mx" {
  const lang = typeof navigator !== "undefined" ? navigator.language : "";
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("es")) return "mx"; // es-MX, es → Mexican Spanish
  return "en";
}

/**
 * Resolve the initial locale:
 * 1. If the user has explicitly saved a locale preference → use it.
 * 2. If no preference saved yet → detect from browser language.
 */
function resolveInitialLocale(): "en" | "pl" | "mx" {
  if (typeof localStorage === "undefined") return detectBrowserLocale();
  try {
    const raw = localStorage.getItem(REP_STORAGE_KEYS.settings);
    if (raw) {
      const parsed = JSON.parse(raw) as { locale?: string };
      if (parsed?.locale === "pl" || parsed?.locale === "mx" || parsed?.locale === "en") {
        return parsed.locale;
      }
    }
  } catch {
    // ignore
  }
  return detectBrowserLocale();
}

const savedLocale = resolveInitialLocale();

const localeLoaders: Record<string, () => Promise<Record<string, unknown>>> = {
  en: async () => ({ ...(await import("@i18n/en.json")).default, $vuetify: vuetifyEn }),
  pl: async () => ({ ...(await import("@i18n/pl.json")).default, $vuetify: vuetifyPl }),
  mx: async () => ({ ...(await import("@i18n/mx.json")).default, $vuetify: vuetifyEs }),
};

const initialMessages = await localeLoaders[savedLocale]();

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: "en",
  messages: { [savedLocale]: initialMessages },
});

/** Load locale messages on demand before switching i18n.global.locale. */
export async function loadLocale(locale: "en" | "pl" | "mx"): Promise<void> {
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
