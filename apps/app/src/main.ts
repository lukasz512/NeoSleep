import { createApp } from "vue";
import { createGtag } from "vue-gtag";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import vuetify, { repLightTheme, repDarkTheme } from "./plugins/vuetify";
import { i18n } from "./plugins/i18n";
import "./assets/theme.scss";
import "./assets/transitions.css";
import { getRepSettings } from "./utils/rep-settings";
import { sendFrontendError } from "./utils/api";

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

const _recentErrors = new Map<string, number>();

app.config.errorHandler = (err, _instance, info) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? "") : "";
  console.error(`[Vue error] ${info}:`, err);
  if (typeof window !== "undefined") {
    const key = `${info}:${message}`;
    const now = Date.now();
    if ((_recentErrors.get(key) ?? 0) + 5000 < now) {
      _recentErrors.set(key, now);
      void sendFrontendError(`[Vue] ${info}: ${message}`, stack, { info, url: window.location.pathname });
    }
  }
};

const gaId = import.meta.env.VITE_GA_ID as string | undefined;
if (import.meta.env.PROD && gaId) {
  app.use(createGtag({ tagId: gaId, pageTracker: { router } }));
}

app.mount("#app");
