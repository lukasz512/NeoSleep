import { createApp } from "vue";
import { createGtag } from "vue-gtag";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import vuetify, { lightTheme, darkTheme } from "./plugins/vuetify";
import { i18n } from "./plugins/i18n";
import "./assets/theme.scss";
import "./assets/app-responsive.scss";
import "./assets/flags.css";
import "@brand/transitions.css";
import "./assets/transitions.css";
import { setupDiagnosticReporter } from "./composables/useDiagnosticReporter";
import { apiFetch } from "./utils/api";
import { getApiUrl } from "./constants";
import { resolveInitialThemeMode } from "@stores";

// Silent wake-up ping: the API can cold-start (Render free tier spins down when
// idle), so hit the cheapest possible route as early as possible — before the
// user even reaches the login form — instead of waiting for their first real
// request to eat the cold-start delay. Fire-and-forget: no loading state, no
// error surfaced (plain fetch, not apiFetch, so a failure never reaches the
// notification pipeline).
fetch(`${getApiUrl()}/health`).catch(() => {});

// Pre-mount, before Pinia exists — avoids a flash of the wrong theme. The
// theme store re-resolves reactively (incl. the tenant-default tier) once
// the app mounts; see composables/useLayoutState.ts.
const savedTheme = resolveInitialThemeMode();

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
