import { createApp } from "vue";
import { createPinia } from "pinia";
import "./assets/flags.css";
import { createI18n } from "vue-i18n";
import { createUnhead, headSymbol } from "@unhead/vue";
import { createGtag } from "vue-gtag";
import App from "./App.vue";
import router from "./router";
import { getTenantId, loadTenantOverlay } from "./composables/useTenantI18n";
import { resolveInitialThemeMode, useMotionPreferenceStore } from "@stores";

// Pre-mount, before Pinia exists — avoids a flash of the wrong theme. The
// theme store re-resolves reactively (incl. the tenant-default tier) once
// the app mounts; see apps/web/src/composables/useTheme.ts.
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", resolveInitialThemeMode());
}

const STORAGE_KEY = "neosleep-website-locale";
const supportedLocales = ["en", "pl", "mx"] as const;

const tenantId = getTenantId();

const [en, pl, mx, tEn, tPl, tMx] = await Promise.all([
  import("@i18n/en.json").then((m) => m.default),
  import("@i18n/pl.json").then((m) => m.default),
  import("@i18n/mx.json").then((m) => m.default),
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
app.use(createPinia());
app.use(router);
app.use(i18n);
app.provide(headSymbol, createUnhead());

useMotionPreferenceStore().startListening();

const gaId = import.meta.env.VITE_GA_ID as string | undefined;
if (import.meta.env.PROD && gaId) {
  app.use(createGtag({ tagId: gaId, pageTracker: { router } }));
}

app.mount("#app");
