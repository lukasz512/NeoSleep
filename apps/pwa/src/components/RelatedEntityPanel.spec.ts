import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import en from "@i18n/en.json";
import RelatedEntityPanel from "./RelatedEntityPanel.vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STUB_ROUTE = { template: "<div/>" };

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: STUB_ROUTE },
      { path: "/patients/:id", name: "patient-detail", component: STUB_ROUTE },
    ],
  });
}

function fakeResponse(items: Record<string, unknown>[], ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    clone() {
      return this;
    },
    json: () => Promise.resolve({ items }),
    text: () => Promise.resolve(JSON.stringify({ items })),
  } as unknown as Response;
}

function stubFetch(impl: () => Promise<Response>) {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = impl as unknown as typeof fetch;
}

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function mountPanel(opts: { items?: Record<string, unknown>[]; ok?: boolean; offline?: boolean } = {}) {
  setActivePinia(createPinia());
  const router = createTestRouter();
  await router.push("/");
  await router.isReady();

  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  stubFetch(() =>
    opts.offline
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve(fakeResponse(opts.items ?? [], opts.ok ?? true)),
  );

  const el = document.createElement("div");
  document.body.appendChild(el);

  const wrapper = mount(RelatedEntityPanel, {
    attachTo: el,
    props: {
      endpoint: "/api/v1/hcp/1/patients",
      detailRouteName: "patient-detail",
      emptyLabel: "No related patients",
    },
    global: { plugins: [i18n, vuetify, router] },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();

  return wrapper;
}

describe("RelatedEntityPanel", () => {
  it("renders one list item per related entity, in the order returned by the API", async () => {
    const wrapper = await mountPanel({
      items: [
        { id: "1", name: "Alpha", meta: "M" },
        { id: "2", name: "Beta" },
      ],
    });
    const items = wrapper.findAll(".related-entity-panel__item");
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain("Alpha");
    expect(items[1]!.text()).toContain("Beta");
  });

  it("shows the meta span only for items that have one", async () => {
    const wrapper = await mountPanel({ items: [{ id: "1", name: "Alpha", meta: "M" }, { id: "2", name: "Beta" }] });
    const items = wrapper.findAll(".related-entity-panel__item");
    expect(items[0]!.find(".related-entity-panel__meta").exists()).toBe(true);
    expect(items[1]!.find(".related-entity-panel__meta").exists()).toBe(false);
  });

  it("shows the empty-state label when the API returns no items", async () => {
    const wrapper = await mountPanel({ items: [] });
    expect(wrapper.text()).toContain("No related patients");
  });

  // NEO-81: a server failure is no longer described as a connection problem.
  it("a 500 says the problem is on our side, not the user's connection", async () => {
    const wrapper = await mountPanel({ ok: false });
    expect(wrapper.text()).toContain(en["common.error.server.title"]);
    expect(wrapper.text()).not.toContain(en["common.error.network.title"]);
    expect(wrapper.text()).not.toContain(en["app.errorState.title"]);
  });

  it("a request that never reached the server says to check the connection", async () => {
    const wrapper = await mountPanel({ offline: true });
    expect(wrapper.text()).toContain(en["common.error.network.title"]);
    expect(wrapper.text()).toContain(en["common.error.network.body"]);
  });

  // CSS values aren't observable through a jsdom mount — read the scoped
  // stylesheet directly. Same pattern as AppDataTable.spec.ts / RepEntityList.spec.ts.
  describe("styling facts (NEO-15: shared --pwa-table-border token)", () => {
    const source = readFileSync(path.resolve(__dirname, "./RelatedEntityPanel.vue"), "utf-8");

    it("item divider border uses --pwa-table-border, not Vuetify's generic --v-border-color", () => {
      expect(source).toMatch(/\.related-entity-panel__item\s*{[^}]*border-bottom:\s*1px solid var\(--pwa-table-border\)/);
      expect(source).not.toMatch(/border-bottom:\s*1px solid rgba\(var\(--v-border-color\)/);
    });
  });
});
