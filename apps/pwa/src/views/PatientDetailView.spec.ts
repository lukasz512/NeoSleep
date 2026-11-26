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
import FormRenderer from "../components/FormRenderer.vue";
import AppointmentDialog from "../components/AppointmentDialog.vue";
import "../components/EventForm.vue";
import { PATIENT_CHANGED } from "../composables/usePatientChanged";
import PatientDetailView from "./PatientDetailView.vue";
import QuestionnaireQrDialog from "../components/questionnaire/QuestionnaireQrDialog.vue";

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

  it("a manager sees Studies and Documents (NEO-83)", async () => {
    // The Details tab's Estudios card fetches /checklist too — answer it with a real checklist, not the patient.
    routeApi();
    const { wrapper } = await mountPatientDetail("manager");
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).toContain("Studies");
    expect(tabs).toContain("Documents");
    await flushPromises();
  });
});

describe("PatientDetailView — Documents tab", () => {
  // NEO-193: Documents = consent + the Historia Clínica parts, from the same checklist as Studies (no duplicate file list).
  it("shows Documents before Studies; Documents lists only the document items, Studies only the results", async () => {
    routeApi();
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]');
    const labels = tabs.map((t) => t.text());
    expect(labels.indexOf("Documents")).toBeLessThan(labels.indexOf("Studies"));

    await tabs.find((t) => t.text() === "Documents")!.trigger("click");
    await vi.waitFor(() => expect(wrapper.find(".studies__item").exists()).toBe(true));
    expect(wrapper.findAll(".studies__item-title").map((r) => r.text())).toEqual(["Informed consent"]);
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/documents"))).toBe(false);

    await tabs.find((t) => t.text() === "Studies")!.trigger("click");
    // Visited tabs stay mounted — each panel holds only its own items.
    const panelTitles = () => wrapper.findAll(".studies").map((panel) => panel.findAll(".studies__item-title").map((r) => r.text()));
    await vi.waitFor(() => expect(panelTitles()).toEqual([["Informed consent"], ["Polysomnography"]]));

    // See HCPDetailView.spec.ts's own comment: flushes FormRenderer/EventForm's
    // in-flight dynamic import before afterEach() unmounts.
    await flushPromises();
  });
});

const CHECKLIST = {
  items: [
    { key: "informedConsent", templateKey: "informedConsent", label: "informedConsent", fillMode: "consent", group: "consent", category: "document", status: "done", completed_at: null, history: [], pending_request_id: null, actions: {} },
    { key: "polysomnography", templateKey: null, label: "polysomnography", fillMode: "external", group: "results", category: "study", status: "missing", completed_at: null, history: [], pending_request_id: null, actions: {} },
  ],
  other_uploads: [],
  pending_requests: [],
  summary: { done: 1, total: 2 },
};

const SUMMARY = {
  preferred_name: null,
  shipping_address: null,
  data_consent_at: null,
  data_consent_withdrawn_at: null,
  latest_study: { id: "s-1", study_date: "2026-09-12", ahi_score: 22.4, spo2_nadir: 84, odi: 19, diagnosis_code: null },
  device_order: null,
  next_appointment: null,
};

// jsdom has no scrollIntoView (the Studies tab scrolls the opened item into view).
Element.prototype.scrollIntoView = vi.fn();

function routeApi() {
  apiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/v1/patient/patient-1") return jsonResponse(true, 200, PATIENT);
    if (path.endsWith("/checklist")) return jsonResponse(true, 200, CHECKLIST);
    if (path.endsWith("/summary")) return jsonResponse(true, 200, SUMMARY);
    return jsonResponse(true, 200, { items: [] });
  });
}

describe("PatientDetailView — Details tab (NEO-206)", () => {
  it("Details has no documents checklist and loads the summary strip instead", async () => {
    routeApi();
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="summary-strip"]').exists()).toBe(true));
    expect(wrapper.find(".studies-summary").exists()).toBe(false);
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/checklist"))).toBe(false);
    await flushPromises();
  });

  it("the PSG tile opens the Studies tab", async () => {
    routeApi();
    const { wrapper, router } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="tile-psg"]').exists()).toBe(true));
    await wrapper.find('[data-testid="tile-psg"]').trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.query).toMatchObject({ tab: "studies" }));
    await flushPromises();
  });
});

describe("PatientDetailView — Estudios checklist (NEO-36)", () => {
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

describe("PatientDetailView — Next step tab (NEO-235)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("below 1280px the side panel is tab 2, right after Details", async () => {
    routeApi();
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text()).slice(0, 2)).toEqual(["Details", "Next step"]);
    await tabs[1]!.trigger("click");
    await vi.waitFor(() => expect(wrapper.find(".patient-aside--inline").exists()).toBe(true));
    await flushPromises();
  });

  it("from 1280px the panel sits beside the record, so there is no Next step tab", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1280px)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }));
    routeApi();
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).not.toContain("Next step");
    await flushPromises();
  });
});

async function mountWithQrQuery(): Promise<VueWrapper> {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "doc@clinic.test", name: "Test", role: "doctor" } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/patients/patient-1?qr=1");
  await router.isReady();
  const wrapper = mount(PatientDetailView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("PatientDetailView — QR opens straight to a loader (NEO-235)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("?qr=1 shows the QR loader before the record has loaded, then the code in the same dialog", async () => {
    let releasePatient: () => void = () => {};
    const patientReady = new Promise<void>((resolve) => (releasePatient = resolve));
    const created = { id: "qr-1", items: ["informedConsent"], completed_items: [], opened_at: null, expires_at: new Date(Date.now() + 86_400_000).toISOString() };
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/v1/patient/patient-1") {
        await patientReady;
        return jsonResponse(true, 200, PATIENT);
      }
      if (path.endsWith("/questionnaire-requests") && init?.method === "POST") return jsonResponse(true, 201, { ...created, url: "https://pwa.test/q#abc" });
      if (path.endsWith("/checklist")) return jsonResponse(true, 200, CHECKLIST);
      if (path.endsWith("/summary")) return jsonResponse(true, 200, SUMMARY);
      return jsonResponse(true, 200, { items: [] });
    });
    await mountWithQrQuery();

    await vi.waitFor(() => expect(document.body.querySelector(".qr-dialog__loading")).not.toBeNull());
    expect(document.body.querySelector(".qr-dialog__code")).toBeNull();

    releasePatient();
    await vi.waitFor(() => expect(document.body.querySelector(".qr-dialog__code")).not.toBeNull());
    expect(document.body.querySelector(".qr-dialog__loading")).toBeNull();
    // One dialog from tap to code — the Documentos tab fills the view's dialog, it doesn't open its own.
    expect(document.body.querySelectorAll(".qr-dialog__body")).toHaveLength(1);
    await flushPromises();
  });

  it("closes the loader when the record can't be found", async () => {
    apiFetch.mockResolvedValue(jsonResponse(false, 404, { error: "not found" }));
    const wrapper = await mountWithQrQuery();
    const dialog = wrapper.findComponent(QuestionnaireQrDialog);
    expect(dialog.props("modelValue")).toBe(true);
    await flushPromises();
    await vi.waitFor(() => expect(dialog.props("modelValue")).toBe(false));
  });
});

describe("PatientDetailView — the card refreshes in place (patient card refresh)", () => {
  it("saving an edit keeps the record on screen while it reloads, then shows the new values", async () => {
    let releaseReload: () => void = () => {};
    let loads = 0;
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/v1/patient/patient-1" && init?.method === "PATCH") return jsonResponse(true, 200, {});
      if (path === "/api/v1/patient/patient-1") {
        loads += 1;
        if (loads === 1) return jsonResponse(true, 200, PATIENT);
        await new Promise<void>((resolve) => (releaseReload = resolve));
        return jsonResponse(true, 200, { ...PATIENT, name: "Jan Nowak" });
      }
      if (path.endsWith("/summary")) return jsonResponse(true, 200, SUMMARY);
      return jsonResponse(true, 200, { items: [] });
    });
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));

    wrapper.findComponent(FormRenderer).vm.$emit("submit", { last_name: "Nowak" }, vi.fn());
    await vi.waitFor(() => expect(loads).toBe(2));
    expect(wrapper.text()).toContain("Jan Kowalski"); // no blank screen while it reloads

    releaseReload();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Nowak"));
    await flushPromises();
  });

  it("a booked visit tells the rest of the card (patient-changed, visits)", async () => {
    routeApi();
    const { wrapper } = await mountPatientDetail();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Jan Kowalski"));
    const heard = vi.fn();
    const listener = (e: Event) => heard((e as CustomEvent).detail);
    window.addEventListener(PATIENT_CHANGED, listener);

    await wrapper.find('[data-testid="patient-book-appointment"]').trigger("click");
    await vi.waitFor(() => expect(wrapper.findComponent(AppointmentDialog).exists()).toBe(true));
    wrapper.findComponent(AppointmentDialog).vm.$emit("saved", { id: "a-1" });
    expect(heard).toHaveBeenCalledWith({ patientId: "patient-1", scope: "visits" });

    window.removeEventListener(PATIENT_CHANGED, listener);
    await flushPromises();
  });
});
