/**
 * DB-free harness for e2e/entity-list-width.spec.ts — served only by the Vite
 * dev server, never part of `vite build`. Mounts the real AppEntityList (phone
 * card feed below Vuetify's mobile breakpoint, desktop table above it) inside
 * a stand-in for AppLayout's content sheet: the same inset variables and
 * padding, on phones and on desktop. Rows running out to the sheet's edges is
 * a layout fact (a negative margin inside a scroll container gets clipped) that
 * only a real browser engine computes.
 *
 * The list endpoint is answered in the page itself (window.fetch stub), so no
 * API or DB is needed.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { useDisplay } from "vuetify";
import vuetify, { lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import AppEntityList from "../../src/components/AppEntityList.vue";
import AppButton from "../../src/components/AppButton.vue";
import AppIcon from "../../src/components/AppIcon.vue";

vuetify.theme.change(lightTheme);

const ENDPOINT = "/api/v1/harness-list";
const ITEMS = [
  { id: "1", name: "Dr. Anna Kowalska", meta: "PL · Klinika Testowa", kind: "Pulmonologist" },
  { id: "2", name: "Dr. Andrzej Testerski", meta: "Łódzkie · Szpital Kliniczny Warszawa", kind: "Dentist" },
  { id: "3", name: "Dra. Laura Cuicas", meta: "Dra. Laura Cuicas", kind: "Dentist" },
  { id: "4", name: "Dra. Alejandra Paredes", meta: "PL · Multisonrisas", kind: "Dentist" },
  { id: "5", name: "Dra. Lorena González", meta: "Dentiflu", kind: "Dentist" },
];

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes(ENDPOINT)) {
    const body = JSON.stringify({ items: ITEMS, total: ITEMS.length });
    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Stub }] });

const listI18n = {
  searchPlaceholder: "app.common.search",
  filtersTitle: "app.common.filters",
  filtersClear: "app.common.clear",
  add: "app.common.add",
  emptyTitle: "app.common.empty",
  emptySubtitle: "app.common.empty",
  noResultsForCriteria: "app.common.empty",
  noResultsForCriteriaSubtitle: "app.common.empty",
  tableNoResults: "app.common.empty",
  errorLoad: "app.common.error",
};

const Harness = defineComponent({
  setup() {
    const { mobile } = useDisplay();
    return () =>
      h(
        "div",
        {
          // AppLayout.vue's sheet: phone → 8 px off the screen edge, 16 + 12 px
          // padding; desktop → the page gutter as padding.
          "data-testid": "harness-sheet",
          style: mobile.value
            ? "--layout-sheet-pad: 16px; --layout-row-inset: 12px; --layout-card-inset: 28px; margin: 8px; padding: 16px 28px; background: #fff; border-radius: 16px; display: flex; flex-direction: column; min-height: 90vh"
            : "--layout-card-inset: 24px; margin: 12px; padding: 24px; background: #fff; border-radius: 16px; display: flex; flex-direction: column",
        },
        [
          h(
            AppEntityList,
            {
              viewId: "harness",
              apiEndpoint: ENDPOINT,
              headers: [
                { title: "Name", key: "name" },
                { title: "Kind", key: "kind" },
              ],
              // One real filter so the toolbar's active-count badge can be
              // exercised (CORE-112: its top was clipped by the toolbar).
              filterDefinitions: [
                {
                  key: "kind",
                  labelKey: "app.common.filters",
                  type: "select",
                  options: [
                    { title: "Dentist", value: "Dentist" },
                    { title: "Pulmonologist", value: "Pulmonologist" },
                  ],
                },
              ],
              i18n: listI18n,
              cacheable: false,
            },
            {
              "feed-card-avatar": () => h("div", { style: "width: 48px; height: 48px; border-radius: 50%; background: #dfe3f5" }),
              "feed-card-title": ({ item }: { item: Record<string, string> }) => item.name,
              "feed-card-meta": ({ item }: { item: Record<string, string> }) => item.meta,
              "feed-card-status": ({ item }: { item: Record<string, string> }) => h("span", { class: "harness-chip" }, item.kind),
              "feed-card-actions": () =>
                h(AppButton, { icon: true, variant: "text", "aria-label": "More" }, () => h(AppIcon, { name: "dots-vertical" })),
            },
          ),
        ],
      );
  },
});

// The desk behind the sheet, so its edges show in screenshots.
document.body.style.background = "#dfe5e3";
document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
