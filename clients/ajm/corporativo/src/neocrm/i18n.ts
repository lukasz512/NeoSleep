import { createI18n } from "vue-i18n";
import es from "./locales/es.json";
import en from "./locales/en.json";
import type { Locale } from "../lib/locale";

// The neoCRM page keeps its own copy, apart from the AJ Management site's. Spanish here is
// European Spanish (the page is for companies in Spain); English is a translation of it.
export function makeNeoCrmI18n(locale: Locale) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "es",
    messages: { es, en },
  });
}
