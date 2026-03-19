import { createI18n } from "vue-i18n";
import { getRepSettings } from "../utils/rep-settings";

const settings =
  typeof localStorage !== "undefined"
    ? getRepSettings()
    : { locale: "en" as const };

const savedLocale =
  settings.locale === "pl" || settings.locale === "es"
    ? settings.locale
    : "en";

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
