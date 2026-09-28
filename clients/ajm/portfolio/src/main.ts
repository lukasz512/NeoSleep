import { createApp } from "vue";
import App from "./App.vue";
import { makeI18n } from "./i18n";
import { PATH_ROUTING, resolveLocale } from "./lib/locale";
import { isLiteMode, readDeviceSignals } from "./lib/capability";
import "./style.css";

const { locale, redirectTo } = resolveLocale(
  window.location.pathname,
  navigator.languages ?? [],
  window.location.search,
  PATH_ROUTING,
);
if (redirectTo) {
  window.history.replaceState(null, "", redirectTo);
}

const lite = isLiteMode(readDeviceSignals());
document.documentElement.lang = locale === "es" ? "es-MX" : "en";
document.documentElement.classList.toggle("lite", lite);

createApp(App, { locale, lite }).use(makeI18n(locale)).mount("#app");
