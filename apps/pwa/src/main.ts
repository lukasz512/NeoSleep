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
import { setupOfflineCacheSession } from "./composables/useOfflineCacheSession";
import { apiFetch } from "./composables/useApi";
import { authTokenStorage } from "./stores/auth";
import { useNotifications } from "./composables/useNotifications";
import { getApiUrl } from "./constants";
import { resolveInitialThemeMode, useMotionPreferenceStore, APP_VERSION_KEY } from "@stores";
import { resolveAppVersion } from "./appVersion";
import { activateDeferredStyles } from "./boot/bootSplash";

// First thing: apply the bundle CSS that index.html loads as a non-blocking
// preload (so the static boot splash could paint before it arrived) — see
// src/boot/splash.ts. The splash stays up until this has applied.
activateDeferredStyles();

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

useMotionPreferenceStore().startListening();

setupDiagnosticReporter(app);
setupOfflineCacheSession();

app.provide("neo:apiFetch", apiFetch);
app.provide("neo:authTokenStorage", authTokenStorage);
app.provide(APP_VERSION_KEY, resolveAppVersion(import.meta.env));
// Lets shared views in packages/ui (e.g. AuthView, which runs before the
// authenticated shell that owns most of the app's toasts) show a native
// notification without packages/ui depending on apps/pwa's useNotifications
// module directly — same cross-package DI pattern as apiFetch/authTokenStorage.
app.provide("neo:notify", useNotifications().show);
const gaId = import.meta.env.VITE_GA_ID as string | undefined;
if (import.meta.env.PROD && gaId) {
  app.use(createGtag({ tagId: gaId, pageTracker: { router } }));
}

app.mount("#app");
