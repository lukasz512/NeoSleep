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
import AppAvatar from "../components/AppAvatar.vue";
import AppIcon from "../components/AppIcon.vue";

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

describe("HCODetailView — Doctors tab table with stats (NEO-14)", () => {
  it("loads the clinic's doctors from /organization/:id/practitioners and renders patient/device/efficiency stats", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, HCO));
    const { wrapper } = await mountHCODetail();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Acme Clinic"));

    const doctorsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Doctors");
    expect(doctorsTab?.exists()).toBe(true);

    apiFetch.mockResolvedValue(jsonResponse(true, 200, {
      items: [
        { id: "prac-1", name: "Dra. Lorena Pimentel", first_name: "Lorena", last_name: "Pimentel", primary_specialty: "dentist", patient_count: 3, device_count: 2, efficiency_pct: 67 },
        { id: "prac-2", name: "Dr. Beto Ruiz", first_name: "Beto", last_name: "Ruiz", primary_specialty: "dentist", patient_count: 0, device_count: 0, efficiency_pct: null },
      ],
      total: 2,
    }));
    await doctorsTab?.trigger("click");

    await vi.waitFor(() => {
      const urls = apiFetch.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.startsWith("/api/v1/organization/hco-1/practitioners?"))).toBe(true);
    });
    await vi.waitFor(() => expect(wrapper.text()).toContain("Dra. Lorena Pimentel"));
    expect(wrapper.text()).toContain("3 patients · 2 devices · 67%");
    expect(wrapper.text()).toContain("0 patients · 0 devices · —");

    await flushPromises();
  });
});

describe("HCODetailView — avatar icon per org type (NEO-18)", () => {
  // hcoTypeIcon()/AppAvatar's own prop logic already have unit coverage
  // (hcoLabels.spec.ts, AppAvatar.spec.ts) — this closes the one gap flagged
  // when NEO-18 was reopened: nothing exercised the real view's
  // `:org-type="hco.type"` binding end to end, only the helper in isolation.
  it("renders the hospital-specific icon in the record header avatar for a hospital organization", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { ...HCO, type: "hospital" }));
    const { wrapper } = await mountHCODetail();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Acme Clinic"));

    // NEO-56 + NEO-57: the record header's tile is the org's AppAvatar, which
    // carries the org-type icon. Scoped through AppAvatar, not a bare
    // findComponent(AppIcon), which would grab the first icon in the tree.
    expect(wrapper.findComponent(AppAvatar).findComponent(AppIcon).props("name")).toBe("hco-hospital");

    await flushPromises();
  });
});
