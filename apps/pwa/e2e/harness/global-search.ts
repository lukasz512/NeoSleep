/**
 * DB-free harness for the global search palette (CORE-292) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real AppShell with the
 * real GlobalSearch trigger and palette as an admin, and answers /api/v1/search
 * and /api/v1/ai/chat from fixtures.
 *
 * `?theme=dark` · `?open=1` · `?term=ana` · `?ai=1` (asks the AI) · `?bare=1` (no search, the "before")
 */
import { createApp, defineComponent, h, nextTick, onMounted } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { VApp, VAvatar } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import "../../src/styles/page-transitions.css";
import { AppShell } from "@neo/ui";
import AppIcon, { type AppIconName } from "../../src/components/AppIcon.vue";
import GlobalSearch from "../../src/components/GlobalSearch.vue";
import AppNotificationCenter from "../../src/components/AppNotificationCenter.vue";
import { useAuthStore } from "../../src/stores/auth";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? darkTheme : lightTheme;
vuetify.theme.change(theme);
document.documentElement.setAttribute("data-theme", theme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") i18n.global.locale.value = lang;

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

// Fictional people only.
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/search")) {
    return json({
      patients: [
        { id: "p1", label: "Ana Lopez", sublabel: "MX", region: "MX" },
        { id: "p2", label: "Ana Ruiz", sublabel: "MX", region: "MX" },
      ],
      practitioners: [{ id: "d1", label: "Dra. Ana Torres", sublabel: "Pulmonology", region: "MX" }],
      organizations: [{ id: "o1", label: "Clinica Norte", sublabel: "Monterrey", region: "MX" }],
    });
  }
  if (url.includes("/api/v1/ai/chat")) {
    return json({ answer: "Open the doctor's profile and use Invite. A new invite replaces the previous one." });
  }
  if (url.includes("/api/v1/notification")) return json(url.includes("unread-count") ? { count: 0 } : { items: [], total: 0 });
  return realFetch(input, init);
};

const NAV = [
  ["dashboard", "Dashboard"],
  ["appointments", "Visits"],
  ["patients", "Patients"],
  ["hcp", "Doctors"],
] as const;
const navItems = NAV.map(([name, label]) => ({ path: `/${name}`, label, name }));
const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", redirect: "/dashboard" }, ...navItems.map((i) => ({ path: i.path, component: Stub })), { path: "/:p(.*)*", component: Stub }],
});

const pinia = createPinia();
const bare = Boolean(params.get("bare"));

const Harness = defineComponent({
  setup() {
    useAuthStore(pinia).$patch({ user: { id: "u1", role: "admin" } as never });
    onMounted(async () => {
      await router.isReady();
      await nextTick();
      if (params.get("open")) document.querySelector<HTMLElement>('[data-testid="gs-trigger"]')?.click();
      const term = params.get("term");
      if (term) {
        await new Promise((r) => setTimeout(r, 300));
        const input = document.querySelector<HTMLInputElement>('[data-testid="gs-input"]');
        if (input) {
          input.value = term;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      if (params.get("ai")) {
        await new Promise((r) => setTimeout(r, 700));
        document.querySelector<HTMLElement>('[data-testid="gs-ai-entry"]')?.click();
      }
    });
    return () =>
      h(VApp, { class: "layout-root" }, () =>
        h(
          AppShell,
          { navItems, menuLabel: "Modules", moreLabel: "More", closeLabel: "Close", bottomNavShowLabels: true, sheet: true },
          {
            "app-bar-start": () => h("span", { class: "harness-logo" }, "NeoSleep"),
            "app-bar-actions": () =>
              h("div", { class: "harness-actions" }, [
                bare ? null : h(GlobalSearch),
                h(AppNotificationCenter),
                h(VAvatar, { size: 32, color: "primary" }, () => "AN"),
              ]),
            "nav-icon": ({ item }: { item: { name?: string } }) => h(AppIcon, { name: `nav-${item.name}` as AppIconName }),
            default: () =>
              h("div", { class: "harness-sheet" }, [
                h("h1", { class: "harness-title" }, "Today"),
                ...["Visit 09:00", "Visit 10:30", "Visit 12:00"].map((t) => h("div", { class: "harness-card" }, t)),
              ]),
          },
        ),
      );
  },
});

const style = document.createElement("style");
style.textContent = `
  .harness-logo { font-weight: 700; font-size: 17px; color: rgb(var(--v-theme-primary)); padding-inline-start: 8px; }
  .harness-actions { display: flex; align-items: center; gap: 8px; padding-inline-end: 8px; }
  .harness-sheet { margin: 0 8px 12px; padding: 16px; border-radius: 16px; background: var(--pwa-sheet); box-shadow: var(--pwa-sheet-shadow); display: grid; gap: 10px; }
  .harness-title { font-size: 22px; margin: 0 0 4px; }
  .harness-card { padding: 14px; border-radius: 14px; background: rgb(var(--v-theme-surface-container-low)); }
`;
document.head.appendChild(style);

document.getElementById("boot-splash")?.remove();
createApp(Harness).use(pinia).use(router).use(vuetify).use(i18n).mount("#app");
