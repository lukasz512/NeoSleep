export type SupportedLocale = "en" | "pl" | "mx";

const jsonLoaders: Record<SupportedLocale, () => Promise<Record<string, unknown>>> = {
  en: () => import("./en.json").then((m) => m.default),
  pl: () => import("./pl.json").then((m) => m.default),
  mx: () => import("./mx.json").then((m) => m.default),
};

export interface LocaleMessageStore {
  availableLocales: string[];
  setLocaleMessage: (locale: string, messages: Record<string, unknown>) => void;
}

/**
 * Load locale JSON messages on demand before switching a vue-i18n instance's active locale.
 * `extraMessages` lets callers merge additional keys for that locale (e.g. Vuetify's own
 * locale bundle) — this package stays framework-agnostic and doesn't import Vuetify itself.
 */
export async function loadLocaleMessages(
  i18n: LocaleMessageStore,
  locale: SupportedLocale,
  extraMessages?: Record<string, unknown>,
): Promise<void> {
  if (i18n.availableLocales.includes(locale)) return;
  const messages = await jsonLoaders[locale]();
  i18n.setLocaleMessage(locale, extraMessages ? { ...messages, ...extraMessages } : messages);
}
