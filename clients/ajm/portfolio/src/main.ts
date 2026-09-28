import { createApp } from "vue";
import App from "./App.vue";
import { makeI18n } from "./i18n";
import { PATH_ROUTING, resolveLocale } from "./lib/locale";
import { isLiteMode, readDeviceSignals } from "./lib/capability";
import { applyTheme, initialTheme, readStoredTheme } from "./lib/theme";
// Self-hosted fonts (no request to Google, weak-network friendly): Montserrat for everything,
// Italianno for the pen-written accent word (F1 = F3, 2026-09-28), Bodoni Moda italic for figures.
import "@fontsource-variable/montserrat/wght.css";
import "@fontsource/bodoni-moda/latin-400-italic.css";
import "@fontsource/italianno/latin-400.css";
import "./style.css";
import { installGlide } from "./lib/glide";

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
// before mount, so the first paint is already in the right theme
applyTheme(initialTheme(readStoredTheme(), window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));

createApp(App, { locale, lite }).use(makeI18n(locale)).mount("#app");
installGlide();
