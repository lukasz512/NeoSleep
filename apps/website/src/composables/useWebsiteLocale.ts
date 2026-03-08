import { useI18n } from "vue-i18n";

const STORAGE_KEY = "neosleep-website-locale";
const SUPPORTED = ["en", "pl", "es"] as const;

export type WebsiteLocale = (typeof SUPPORTED)[number];

export function useWebsiteLocale() {
  const i18n = useI18n();

  function setLocale(locale: WebsiteLocale) {
  if (!SUPPORTED.includes(locale)) return;
  i18n.locale.value = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch (_) {}
  }

  return {
    locale: i18n.locale,
    supported: SUPPORTED,
    setLocale,
  };
}
