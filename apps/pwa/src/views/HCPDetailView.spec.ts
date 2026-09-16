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

// Sidesteps the "idb" (IndexedDB) offline-cache layer entirely — jsdom has no
// IndexedDB, and loadHCP() fires this fire-and-forget on every successful
// load (see docs/ADR-013-offline-read-cache.md). Not under test here.
vi.mock("../stores/entityCache", () => ({
  useEntityCacheStore: () => ({ cacheOne: vi.fn(), readOne: vi.fn().mockResolvedValue(null) }),
}));

// HCPDetailView renders FormRenderer/EventForm via defineAsyncComponent —
// pre-importing them here (module scope, before any mount/unmount) resolves
// their whole nested chunk graph (FormRenderer -> PhoneField -> FlagIcon,
// etc.) up front, instead of racing that dynamic import against this test's
// own afterEach() unmount.
import "../components/FormRenderer.vue";
import "../components/EventForm.vue";
import HCPDetailView from "./HCPDetailView.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const HCP = {
  id: "hcp-1",
  name: "Dr. Anna Nowak",
  first_name: "Anna",
  last_name: "Nowak",
  email: "anna@example.com",
  phone: "600100200",
  specialty: "cardiology",
  organization_id: null,
  institution: "Acme Clinic",
  region: "pl",
  status: "active",
};

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

async function mountHCPDetail(): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/hcp/hcp-1");
  await router.isReady();

  const wrapper = mount(HCPDetailView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

describe("HCPDetailView — Documents tab", () => {
  it("lists 'Documents' among the tabs and wires it to the practitioner's /documents endpoint", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, HCP));
    const { wrapper } = await mountHCPDetail();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Dr. Anna Nowak"));

    const documentsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Documents");
    expect(documentsTab?.exists()).toBe(true);

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    await documentsTab?.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/practitioner/hcp-1/documents", { handleErrors: false })
    );

    // FormRenderer/EventForm are async components (defineAsyncComponent) that
    // start loading their chunk as soon as this view mounts, regardless of
    // their own v-model visibility — without this, their dynamic import can
    // still be in flight when afterEach() unmounts, producing a benign but
    // noisy "environment was torn down" unhandled rejection.
    await flushPromises();
  });
});
