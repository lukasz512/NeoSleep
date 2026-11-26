import type { Router } from "vue-router";
import { registerSW } from "virtual:pwa-register";
import { browserDeps, createNeedReloadHandler } from "./serviceWorkerUpdate";

/**
 * Registers the service worker (replaces vite-plugin-pwa's injected
 * registerSW.js, which only registered and never reloaded) and checks for a
 * new version whenever the tab comes back to the foreground (NEO-125). The
 * reload decision lives in serviceWorkerUpdate.ts, which tests can import
 * without this virtual module.
 */
export function installServiceWorkerUpdates(router: Pick<Router, "afterEach" | "resolve">): void {
  if (!("serviceWorker" in navigator)) return;
  registerSW({
    immediate: true,
    onNeedReload: createNeedReloadHandler(router, browserDeps()),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        registration.update().catch(() => {
          // benign: offline or server hiccup — the next visibility change or page load checks again
        });
      });
    },
  });
}
