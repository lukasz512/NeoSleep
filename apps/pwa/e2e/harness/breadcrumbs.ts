/**
 * DB-free harness for e2e/breadcrumbs.spec.ts (NEO-56) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real
 * ItemDetailLayout record header (module tile, parent eyebrow link, name h1,
 * three icon actions like every detail view) with the real Vuetify plugin and
 * global stylesheet, because hit areas, wrapping and "nothing jumps" are
 * layout facts only a real browser engine computes.
 *
 * `?state=record` (default) · `loading` · `long` (very long name) · `notfound`.
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

const state = new URLSearchParams(location.search).get("state") ?? "record";
vuetify.theme.change(lightTheme);

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: Stub },
    { path: "/patients", name: "patients", component: Stub },
  ],
});

const name = state === "long"
  ? "María de los Ángeles Fernández-Villaseñor Gutiérrez de la Concepción y Santa Cruz"
  : "Jan Kowalski";

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
            hasContent: state !== "loading" && state !== "notfound",
            loading: state === "loading",
            backRoute: { name: "patients" },
            backLabel: "Back",
            notFoundLabel: "Not found",
            recordTitle: state === "loading" || state === "notfound" ? "" : name,
          },
          {
            "header-actions": actions,
            sections: () => h("p", "Details"),
          },
        ),
      ]);
  },
});

document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
