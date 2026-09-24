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

describe("PatientDetailView — clinical questionnaires live under Studies (NEO-36)", () => {
  it("has no separate 'Historia Endo' tab; the Studies tab loads sleep studies and clinical records together", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, PATIENT));
    const { wrapper } = await mountPatientDetail();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).not.toContain("Historia Endo");
    const studiesTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Studies");

    apiFetch.mockImplementation(async (path: string) =>
      path.includes("clinical-records")
        ? jsonResponse(true, 200, { records: [], pending_requests: [] })
        : jsonResponse(true, 200, { items: [] })
    );
    await studiesTab?.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/clinical-records", { handleErrors: false })
    );
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/sleep-study?patient_id=patient-1&limit=-1", { handleErrors: false });

    await flushPromises();
  });
});
