import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import { routes } from "../router/routes";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

// Sidesteps the "idb" (IndexedDB) offline-cache layer — jsdom has no
// IndexedDB, and loadHCO() fires this fire-and-forget on every successful
// load (see docs/ADR-013-offline-read-cache.md). Not under test here.
vi.mock("../stores/entityCache", () => ({
  useEntityCacheStore: () => ({ cacheOne: vi.fn(), readOne: vi.fn().mockResolvedValue(null) }),
}));

// See HCPDetailView.spec.ts's own comment: pre-imports FormRenderer/EventForm's
// whole nested chunk graph up front instead of racing it against teardown.
import "../components/FormRenderer.vue";
import "../components/EventForm.vue";
import HCODetailView from "./HCODetailView.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const HCO = {
  id: "hco-1",
  name: "Acme Clinic",
  type: "clinic",
  region: "pl",
  status: "active",
};

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

async function mountHCODetail(): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/hco/hco-1");
  await router.isReady();

  const wrapper = mount(HCODetailView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

describe("HCODetailView — Documents tab", () => {
  it("lists 'Documents' among the tabs and wires it to the organization's /documents endpoint", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, HCO));
    const { wrapper } = await mountHCODetail();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Acme Clinic"));

    const documentsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Documents");
    expect(documentsTab?.exists()).toBe(true);

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    await documentsTab?.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/organization/hco-1/documents", { handleErrors: false })
    );

    // See HCPDetailView.spec.ts's own comment: flushes FormRenderer/EventForm's
    // in-flight dynamic import before afterEach() unmounts.
    await flushPromises();
  });
});
