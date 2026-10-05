/**
 * DB-free harness for the app bar actions (CORE-131, CORE-134) — served only
 * by the Vite dev server. Renders the real notification bell
 * (AppNotificationCenter, unread count from a stubbed API) and the real
 * AppAccountButton, desktop + compact, on the app bar's own colour
 * (--pwa-desk), so Tab, hover and the badges behave as in the app.
 * AppLayout's fit-to-shell padding is mirrored below (it lives in AppLayout).
 *
 * `?theme=dark` · `?unread=12` (default 1)
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import AppAccountButton from "../../src/layouts/components/AppAccountButton.vue";
import AppNotificationCenter from "../../src/components/AppNotificationCenter.vue";
import { useNotificationCenter } from "../../src/composables/useNotificationCenter";

const params = new URLSearchParams(location.search);
const dark = params.get("theme") === "dark";
const unread = Number(params.get("unread") ?? 1);
vuetify.theme.change(dark ? darkTheme : lightTheme);
document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
document.getElementById("boot-splash")?.remove();

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/notification")) {
    const body = url.includes("unread-count") ? { count: unread } : { items: [], total: 0 };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  return realFetch(input, init);
};

const style = document.createElement("style");
style.textContent = `
  .harness-bar .layout-user-btn.v-btn:not(.v-btn--icon) { padding-block: 4px; padding-inline: 12px 6px !important; }
  .harness-bar .layout-user-btn--compact.v-btn:not(.v-btn--icon) { min-width: 0; padding-inline: 6px !important; }
`;
document.head.append(style);

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: Stub }] });

const bar = (compact: boolean) =>
  h("div", {
    class: "harness-bar",
    "data-testid": compact ? "bar-phone" : "bar-desktop",
    style: "display:flex;align-items:center;justify-content:flex-end;gap:8px;height:64px;padding:0 16px;background:var(--pwa-desk);border-radius:12px",
  }, [
    h(AppNotificationCenter),
    h(AppAccountButton, { name: "Łukasz Ostrowski", roleLabel: "Admin", role: "admin", label: "User menu", compact }),
  ]);

const Harness = defineComponent({
  setup() {
    useNotificationCenter().unreadCount.value = unread;
    return () =>
      h("div", { "data-testid": "harness", style: "position:relative;z-index:100;display:grid;gap:16px;padding:24px;max-width:560px;background:rgb(var(--v-theme-surface))" }, [
        bar(false),
        h("div", { style: "max-width:240px;margin-left:auto;width:100%" }, bar(true)),
      ]);
  },
});

createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
