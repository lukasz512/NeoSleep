/**
 * DB-free harness for e2e/breadcrumbs.spec.ts (NEO-56) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real
 * ItemDetailLayout (header row: back arrow, AppBreadcrumbs, three icon
 * actions like every detail view) with the real Vuetify plugin and global
 * stylesheet, because the desktop/phone swap, truncation and touch targets are
 * layout facts only a real browser engine computes.
 *
 * `?state=record` (default) · `loading` · `long` (very long name) · `lead`
 * (inline header-title, no trail).
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/assets/theme.scss";
import "../../src/assets/app-responsive.scss";
import ItemDetailLayout from "../../src/components/ItemDetailLayout.vue";
import AppButton from "../../src/components/AppButton.vue";
import AppIcon from "../../src/components/AppIcon.vue";
import type { BreadcrumbItem } from "../../src/components/AppBreadcrumbs.types";

const state = new URLSearchParams(location.search).get("state") ?? "record";
vuetify.theme.change(lightTheme);

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: Stub },
    { path: "/patients", name: "patients", component: Stub },
    { path: "/leads", name: "leads", component: Stub },
  ],
});

const name = state === "long"
  ? "María de los Ángeles Fernández-Villaseñor Gutiérrez de la Concepción"
  : "Jan Kowalski";

const trail: BreadcrumbItem[] = [
  {
    label: name,
    avatar: { name, entityType: "patient" },
    secondary: "Mar 12, 1968",
    secondaryLabel: "Date of birth",
    status: { label: "Follow-up", color: "warning" },
    action: () => {},
  },
  { label: "Studies" },
];

const actions = () =>
  (["calendar", "pencil", "trash"] as const).map((icon) =>
    h(AppButton, { icon: true, variant: "flat", size: "large", "aria-label": icon, class: "harness-action" }, () => h(AppIcon, { name: icon })),
  );

const Harness = defineComponent({
  setup() {
    return () =>
      h("div", { style: "padding: 24px; max-width: 100%; box-sizing: border-box" }, [
        h(
          ItemDetailLayout,
          {
            hasContent: state !== "loading",
            loading: state === "loading",
            backRoute: { name: state === "lead" ? "leads" : "patients" },
            backLabel: "Back",
            notFoundLabel: "Not found",
            breadcrumbs: state === "lead" ? [] : trail,
          },
          {
            ...(state === "lead" ? { "header-title": () => h("h1", { style: "margin:0;font-size:1.25rem" }, "Maria Wiśniewska") } : {}),
            "header-actions": actions,
            title: () => h("h1", { class: "view-item__title" }, name),
          },
        ),
      ]);
  },
});

document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
