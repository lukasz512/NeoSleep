import { createI18n } from "vue-i18n";
import es from "./locales/es.json";
import en from "./locales/en.json";
import type { Locale } from "./lib/locale";

// Spanish is the source copy (the client's proposal is in ES); English is a translation of it.
export function makeI18n(locale: Locale) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "es",
    messages: { es, en },
  });
}
