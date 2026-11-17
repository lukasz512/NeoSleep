import { createApp } from "vue";
import NeoCrmApp from "./NeoCrmApp.vue";
import { makeNeoCrmI18n } from "./i18n";
import { isPersonalLink } from "./lens";
import { resolveLocale } from "../lib/locale";
import { applyTheme, initialTheme, readStoredTheme } from "../lib/theme";
import "@fontsource-variable/caveat/wght.css";
import "./neocrm.css";

// One address (/corporativo/neocrm/): Spanish unless the link says ?lang=en, like the main site.
const { locale } = resolveLocale(window.location.pathname, navigator.languages ?? [], window.location.search, false, "es");
document.documentElement.lang = locale === "es" ? "es-ES" : "en";
// before mount, so the first paint is already in the right theme
applyTheme(initialTheme(readStoredTheme(), window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));

if (isPersonalLink(window.location.search)) {
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex";
  document.head.append(robots);
}

const i18n = makeNeoCrmI18n(locale);
document.title = i18n.global.t("meta.title");
document.querySelector('meta[name="description"]')?.setAttribute("content", i18n.global.t("meta.description"));

createApp(NeoCrmApp, { locale, search: window.location.search }).use(i18n).mount("#app");
