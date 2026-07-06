import { createApp } from "vue";
import { createGtag } from "vue-gtag";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import vuetify, { lightTheme, darkTheme } from "./plugins/vuetify";
import { i18n } from "./plugins/i18n";
import "./assets/theme.scss";
import "./assets/app-responsive.scss";
import "./assets/transitions.css";
import { getUserSettings } from "./utils/user-settings";
import { setupDiagnosticReporter } from "./composables/useDiagnosticReporter";
import { apiFetch } from "./utils/api";

const settings = typeof localStorage !== "undefined" ? getUserSettings() : { theme: "light" as const, locale: "en" as const };
const savedTheme = settings.theme === "dark" ? "dark" : "light";

if (typeof document !== "undefined" && document.documentElement) {
  document.documentElement.setAttribute("data-theme", savedTheme);
}

vuetify.theme.change(savedTheme === "dark" ? darkTheme : lightTheme);

const app = createApp(App);
app.use(createPinia());
app.use(vuetify);
app.use(router);
app.use(i18n);

setupDiagnosticReporter(app);

app.provide("neo:apiFetch", apiFetch);
const gaId = import.meta.env.VITE_GA_ID as string | undefined;
if (import.meta.env.PROD && gaId) {
  app.use(createGtag({ tagId: gaId, pageTracker: { router } }));
}

app.mount("#app");
