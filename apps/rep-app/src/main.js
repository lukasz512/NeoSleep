import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import router from "./router";
import vuetify, { repLightTheme, repDarkTheme } from "./plugins/vuetify";
import "./assets/theme.scss";
import { getRepSettings } from "./utils/rep-settings";
const en = await import("@i18n/en.json").then((m) => m.default);
const pl = await import("@i18n/pl.json").then((m) => m.default);
const es = await import("@i18n/es.json").then((m) => m.default);
const settings = typeof localStorage !== "undefined" ? getRepSettings() : { theme: "light", locale: "en" };
const savedTheme = settings.theme === "dark" ? "dark" : "light";
const savedLocale = settings.locale === "pl" || settings.locale === "es" ? settings.locale : "en";
const initialLocale = savedLocale;
if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", savedTheme);
}
// Keep Vuetify theme in sync with rep-app theme (for v-data-table etc.)
vuetify.theme.change(savedTheme === "dark" ? repDarkTheme : repLightTheme);
const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: "en",
    messages: { en, pl, es },
});
const app = createApp(App);
app.use(createPinia());
app.use(vuetify);
app.use(router);
app.use(i18n);
app.mount("#app");
