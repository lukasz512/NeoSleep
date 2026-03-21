import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import { createUnhead, headSymbol } from "@unhead/vue";
import App from "./App.vue";
import router from "./router";
import { getTenantId, loadTenantOverlay } from "./composables/useTenantI18n";

const STORAGE_KEY_THEME = "neosleep-website-theme";

function initTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_THEME);
    if (v === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else if (v !== "light") {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches)
        document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (_) {}
}
initTheme();

const STORAGE_KEY = "neosleep-website-locale";
const supportedLocales = ["en", "pl", "mx"] as const;

const tenantId = getTenantId();

const [en, pl, mx, tEn, tPl, tMx] = await Promise.all([
  import("@neo/i18n/en.json").then((m) => m.default),
  import("@neo/i18n/pl.json").then((m) => m.default),
  import("@neo/i18n/mx.json").then((m) => m.default),
  loadTenantOverlay(tenantId, "en"),
  loadTenantOverlay(tenantId, "pl"),
  loadTenantOverlay(tenantId, "mx"),
]);

function getInitialLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && supportedLocales.includes(stored as (typeof supportedLocales)[number])) return stored;
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("pl")) return "pl";
    if (lang.startsWith("es")) return "mx";
  } catch (_) {}
  return "en";
}

const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: "en",
  messages: {
    en: { ...en, ...tEn },
    pl: { ...pl, ...tPl },
    mx: { ...mx, ...tMx },
  },
});

const app = createApp(App);
app.use(router);
app.use(i18n);
app.provide(headSymbol, createUnhead());
app.mount("#app");
