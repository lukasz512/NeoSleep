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
import { useAuthStore } from "../stores/auth";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

// See HCPDetailView.spec.ts's own comment: pre-imports FormRenderer/EventForm's
// whole nested chunk graph up front instead of racing it against teardown.
import "../components/FormRenderer.vue";
import "../components/EventForm.vue";
import PatientDetailView from "./PatientDetailView.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const PATIENT = {
  id: "patient-1",
  name: "Jan Kowalski",
  first_name: "Jan",
  last_name: "Kowalski",
  status: "active",
  region: "pl",
};

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

async function mountPatientDetail(role = "doctor"): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  // Studies / Documents (health data) are admin/doctor only.
  useAuthStore().user = { id: "u-1", email: "doc@clinic.test", name: "Test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/patients/patient-1");
  await router.isReady();

  const wrapper = mount(PatientDetailView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

describe("PatientDetailView — health-data tabs", () => {
  it("a rep doesn't see Studies or Documents (admin/doctor only), but keeps the other tabs", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, PATIENT));
    const { wrapper } = await mountPatientDetail("rep");
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).not.toContain("Studies");
    expect(tabs).not.toContain("Documents");
    expect(tabs).toContain("Notes");
    await flushPromises();
  });

  it("a manager sees Studies (NEO-83) but not Documents", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, PATIENT));
    const { wrapper } = await mountPatientDetail("manager");
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).toContain("Studies");
    expect(tabs).not.toContain("Documents");
    await flushPromises();
  });
});

describe("PatientDetailView — Documents tab", () => {
  it("lists 'Documents' among the tabs and wires it to the patient's /documents endpoint", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, PATIENT));
    const { wrapper } = await mountPatientDetail();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const documentsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Documents");
    expect(documentsTab?.exists()).toBe(true);

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    await documentsTab?.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/documents", { handleErrors: false })
    );

    // See HCPDetailView.spec.ts's own comment: flushes FormRenderer/EventForm's
    // in-flight dynamic import before afterEach() unmounts.
    await flushPromises();
  });
});

const CHECKLIST = {
  items: [
    { key: "informedConsent", templateKey: "informedConsent", label: "informedConsent", fillMode: "consent", group: "consent", status: "done", completed_at: null, history: [], pending_request_id: null, actions: {} },
    { key: "polysomnography", templateKey: null, label: "polysomnography", fillMode: "external", group: "results", status: "missing", completed_at: null, history: [], pending_request_id: null, actions: {} },
  ],
  other_uploads: [],
  pending_requests: [],
  summary: { done: 1, total: 2 },
};

// jsdom has no scrollIntoView (the Studies tab scrolls the opened item into view).
Element.prototype.scrollIntoView = vi.fn();

function routeApi() {
  apiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/v1/patient/patient-1") return jsonResponse(true, 200, PATIENT);
    if (path.endsWith("/checklist")) return jsonResponse(true, 200, CHECKLIST);
    return jsonResponse(true, 200, { items: [] });
  });
}

describe("PatientDetailView — Estudios checklist (NEO-36)", () => {
  it("the Details tab shows one status icon per study; a click opens that item in the Studies tab", async () => {
    routeApi();
    const { wrapper, router } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.find(".studies-summary__item").exists()).toBe(true));

    const icons = wrapper.findAll(".studies-summary__item");
    expect(icons.map((b) => b.text())).toEqual(["Informed consent", "Polysomnography"]);
    expect(icons[0]!.classes()).toContain("studies-summary__item--done");
    expect(wrapper.text()).toContain("1 of 2 done");

    await icons[1]!.trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.query).toMatchObject({ tab: "studies", item: "polysomnography" }));
    await vi.waitFor(() => expect(wrapper.find(".studies__item").exists()).toBe(true));
    await flushPromises();
  });

  it("a rep gets no Estudios card and never requests the checklist", async () => {
    routeApi();
    const { wrapper } = await mountPatientDetail("rep");
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));
    await flushPromises();
    expect(wrapper.find(".studies-summary").exists()).toBe(false);
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/checklist"))).toBe(false);
  });

  it("has no separate 'Historia Endo' tab; the Studies tab loads the patient's checklist", async () => {
    routeApi();
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).not.toContain("Historia Endo");
    apiFetch.mockClear();
    await wrapper.findAll('[role="tab"]').find((t) => t.text() === "Studies")!.trigger("click");

    await vi.waitFor(() => expect(wrapper.find(".studies__item").exists()).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/checklist", { handleErrors: false });
    await flushPromises();
  });
});
