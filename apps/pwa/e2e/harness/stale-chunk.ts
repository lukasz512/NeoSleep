/**
 * DB-free harness for e2e/stale-chunk.spec.ts — served only by the Vite dev
 * server. A router with one lazy route, the real toast hub and the real
 * chunk recovery (browser sessionStorage, navigator.onLine, timers) — only
 * the final page reload is recorded instead of performed, so the spec can
 * assert where it would have gone.
 */
/* eslint-disable vue/one-component-per-file -- tiny throwaway harness components */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory, RouterView, useRouter } from "vue-router";
import vuetify from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/assets/theme.scss";
import AppNotifications from "../../src/components/AppNotifications.vue";
import { useNotifications } from "../../src/composables/useNotifications";
import { installChunkRecovery, browserChunkRecoveryDeps } from "../../src/router/chunkRecovery";

declare global {
  interface Window { __reloadedTo?: string }
}

const List = defineComponent({
  setup() {
    const router = useRouter();
    return () => h("button", { "data-testid": "open-detail", onClick: () => router.push("/patients/42") }, "open");
  },
});

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: List },
    { path: "/patients/:id", component: () => import("./stale-chunk-target") },
  ],
});

installChunkRecovery(router, {
  ...browserChunkRecoveryDeps(useNotifications().show),
  reload: (url) => { window.__reloadedTo = url; },
});

const Harness = defineComponent({ render: () => [h(RouterView), h(AppNotifications)] });

// Same as dialog-header.ts: the injected boot splash isn't dismissed here.
document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(vuetify).use(i18n).use(router).mount("#app");
