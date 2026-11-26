/**
 * DB-free harness for e2e/breadcrumbs.spec.ts (NEO-56) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real
 * ItemDetailLayout record header (module tile, parent eyebrow link, name h1,
 * three icon actions like every detail view) with the real Vuetify plugin and
 * global stylesheet, because hit areas, wrapping and "nothing jumps" are
 * layout facts only a real browser engine computes.
 *
 * `?state=record` (default) · `loading` · `long` (very long name) · `notfound` ·
 * `scroll` (a record with a tall body, for the NEO-181 phone toolbar and collapse) ·
 * `aside` (a record with an #aside side panel, CORE-96).
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import ItemDetailLayout from "../../src/components/ItemDetailLayout.vue";
import AppButton from "../../src/components/AppButton.vue";
import AppIcon from "../../src/components/AppIcon.vue";
import { entityActionBtnClass, entityActionIcon, type EntityActionKey } from "../../src/config/entityActions";

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

// Tones as the real views give them (config/entityActions.ts) — the sticky
// bar reads them to keep delete out of the main slot.
const ACTIONS: [EntityActionKey, string][] = [["scheduleVisit", "Plan visit"], ["edit", "Edit"], ["delete", "Delete"]];
const actions = () =>
  ACTIONS.map(([key, label]) =>
    h(
      AppButton,
      {
        icon: true,
        variant: "flat",
        size: "large",
        "aria-label": label,
        class: ["harness-action", entityActionBtnClass(key)],
        onClick: () => document.body.setAttribute("data-clicked", label),
      },
      () => h(AppIcon, { name: entityActionIcon(key) }),
    ),
  );

const Harness = defineComponent({
  setup() {
    return () =>
      // Like the app on a phone: a 56 px app bar above (Vuetify's --v-layout-top), then the sheet's own padding.
      h("div", { style: "padding: 84px 24px 24px; max-width: 100%; box-sizing: border-box; --v-layout-top: 56px" }, [
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
            // The identity line every person record has (NEO-57), e.g. "M · 46 y".
            "record-details": () => h("span", "M · 46 y"),
            sections: () =>
              state === "scroll" ? h("div", { style: "height: 2000px" }, "Details") : h("p", "Details"),
            ...(state === "aside"
              ? { aside: () => h("div", { "data-testid": "harness-aside", style: "height: 240px; background: #eef3f2" }, "Next step") }
              : {}),
          },
        ),
      ]);
  },
});

document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
