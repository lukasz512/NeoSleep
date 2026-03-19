import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import vuetify, { repLightTheme, repDarkTheme } from "./plugins/vuetify";
import { i18n } from "./plugins/i18n";
import "./assets/theme.scss";
import "./assets/transitions.css";
import { getRepSettings } from "./utils/rep-settings";

const settings = typeof localStorage !== "undefined" ? getRepSettings() : { theme: "light" as const, locale: "en" as const };
const savedTheme = settings.theme === "dark" ? "dark" : "light";

if (typeof document !== "undefined" && document.documentElement) {
  document.documentElement.setAttribute("data-theme", savedTheme);
}

vuetify.theme.change(savedTheme === "dark" ? repDarkTheme : repLightTheme);

const app = createApp(App);
app.use(createPinia());
app.use(vuetify);
app.use(router);
app.use(i18n);
app.mount("#app");
