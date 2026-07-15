import { createI18n } from "vue-i18n";
import { vuetifyLocales } from "@vuetify";
import { loadLocaleMessages, type SupportedLocale } from "@i18n/loadLocale";
import { APP_STORAGE_KEYS } from "../constants";

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
    const raw = localStorage.getItem(APP_STORAGE_KEYS.settings);
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
  en: async () => ({ ...(await import("@i18n/en.json")).default, $vuetify: vuetifyLocales.en }),
  pl: async () => ({ ...(await import("@i18n/pl.json")).default, $vuetify: vuetifyLocales.pl }),
  mx: async () => ({ ...(await import("@i18n/mx.json")).default, $vuetify: vuetifyLocales.mx }),
};

// Zawsze ładuj en jako fallback — Vue i18n sięga po niego gdy klucz brakuje w aktywnym locale.
// Jeśli user ma en → ładujemy raz, bez duplikatu.
const [enMessages, activeMessages] = await Promise.all([
  localeLoaders["en"](),
  savedLocale !== "en" ? localeLoaders[savedLocale]() : Promise.resolve(null),
]);

// Messages are dynamically loaded (Record<string, unknown>) — cast to expected shape.
// vue-i18n's strict typing only matters when using typed message schemas;
// for runtime-loaded JSON messages the cast is safe.
export const i18n = createI18n({
  legacy: false as const,
  locale: savedLocale,
  fallbackLocale: "en",
  messages: {
    en: enMessages,
    ...(savedLocale !== "en" && activeMessages ? { [savedLocale]: activeMessages } : {}),
  } as unknown as Record<string, Record<string, string>>,
});

/** Load locale messages on demand before switching i18n.global.locale. */
export async function loadLocale(locale: SupportedLocale): Promise<void> {
  await loadLocaleMessages(i18n.global, locale, { $vuetify: vuetifyLocales[locale] });
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
