import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import router from "./router";
import vuetify, { repLightTheme, repDarkTheme } from "./plugins/vuetify";
import "./assets/theme.scss";
import { getRepSettings } from "./utils/rep-settings";

const settings = typeof localStorage !== "undefined" ? getRepSettings() : { theme: "light" as const, locale: "en" as const };
const savedTheme = settings.theme === "dark" ? "dark" : "light";
const savedLocale = settings.locale === "pl" || settings.locale === "es" ? settings.locale : "en";

if (typeof document !== "undefined" && document.documentElement) {
  document.documentElement.setAttribute("data-theme", savedTheme);
}

vuetify.theme.change(savedTheme === "dark" ? repDarkTheme : repLightTheme);

const localeLoaders: Record<string, () => Promise<Record<string, string>>> = {
  en: () => import("@i18n/en.json").then((m) => m.default),
  pl: () => import("@i18n/pl.json").then((m) => m.default),
  es: () => import("@i18n/es.json").then((m) => m.default),
};

const initialMessages = await localeLoaders[savedLocale]();

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: "en",
  messages: { [savedLocale]: initialMessages },
});

/** Call before changing i18n.global.locale to ensure messages are loaded. */
export async function loadLocale(locale: "en" | "pl" | "es"): Promise<void> {
  if (i18n.global.availableLocales.includes(locale)) return;
  const messages = await localeLoaders[locale]();
  i18n.global.setLocaleMessage(locale, messages);
}

const app = createApp(App);
app.use(createPinia());
app.use(vuetify);
app.use(router);
app.use(i18n);
app.mount("#app");
