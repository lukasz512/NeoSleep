import { createApp } from "vue";
import "./assets/flags.css";
import { createI18n } from "vue-i18n";
import { createGtag } from "vue-gtag";
import App from "./App.vue";
import router from "./router";

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
const supportedLocales = ["en", "pl", "es"] as const;

const [en, pl, es] = await Promise.all([
  import("@i18n/en.json").then((m) => m.default),
  import("@i18n/pl.json").then((m) => m.default),
  import("@i18n/es.json").then((m) => m.default),
]);

function getInitialLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && supportedLocales.includes(stored as (typeof supportedLocales)[number])) return stored;
    const lang = navigator.language.slice(0, 2).toLowerCase();
    if (supportedLocales.includes(lang as (typeof supportedLocales)[number])) return lang;
  } catch (_) {}
  return "en";
}

const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: "en",
  messages: { en, pl, es },
});

const app = createApp(App);
app.use(router);
app.use(i18n);

const gaId = import.meta.env.VITE_GA_ID as string | undefined;
if (import.meta.env.PROD && gaId) {
  app.use(createGtag({ tagId: gaId, pageTracker: { router } }));
}

app.mount("#app");
