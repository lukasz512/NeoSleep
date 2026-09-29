import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createRouter, createMemoryHistory } from "vue-router";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../../composables/useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

import PatientAsidePanel from "./PatientAsidePanel.vue";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const actions = (qr: boolean) => ({ qr, fill: null, form: null, print: true, upload: true });
const item = (key: string, group: string, status: string, qr = true) => ({
  key, templateKey: key, label: key, fillMode: group, group, category: group === "results" ? "study" : "document", status, completed_at: null, history: [], pending_request_id: null, actions: actions(qr),
});

let checklistItems: ReturnType<typeof item>[];
let plans: unknown[];

beforeEach(() => {
  checklistItems = [item("informedConsent", "consent", "missing"), item("medicalHistory", "patient", "done"), item("polysomnography", "results", "done", false)];
  plans = [{ status: "in_progress", dentist_name: "Dr Ana Ruiz", metadata: null }];
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/v1/note?")) {
      return ok({ items: [{ id: "n1", entity_type: "patient", entity_id: "p-1", author_id: "u-1", author_name: "Rep One", body: "Latest note", created_at: "2026-09-24T10:00:00Z" }] });
    }
    if (path.startsWith("/api/v1/treatment-plan?")) return ok({ items: plans });
    if (path === "/api/v1/patient/p-1/checklist") {
      return ok({ items: checklistItems, other_uploads: [], pending_requests: [], expired_request: null, summary: { done: 2, total: 3 } });
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
});

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountPanel(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div />" } }, { path: "/hcp/:id", name: "hcp-detail", component: { template: "<div />" } }] });
  const wrapper = mount(PatientAsidePanel, {
    props: {
      patient: { id: "p-1", status: "active", ahi_baseline: 32, cpap_device: null, practitioner_id: "h-1", practitioner_name: "Dr Marta Nowak", diagnosis_code: { code: "G47.33", label: "OSA" } },
      canSeeStudies: true,
      activeTab: "details",
      ...props,
    },
    global: { plugins: [i18n, vuetify, router] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const qrButton = (w: VueWrapper) => w.find(".patient-aside__qr");

describe("PatientAsidePanel (NEO-153)", () => {
  it("shows the profile diagnosis in the key facts, or a dash when there is none", async () => {
    expect((await mountPanel()).find(".patient-aside__diagnosis").text()).toBe("G47.33 · OSA");
    const empty = await mountPanel({ patient: { id: "p-1", diagnosis_code: null } });
    expect(empty.find(".patient-aside__diagnosis").text()).toBe("—");
  });

  it("shows the latest OrthoApnea order's status, and 'No order yet' without one", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find(".patient-aside__oa").text()).toContain("Dr Ana Ruiz");
    const [path] = apiFetch.mock.calls.find(([p]) => String(p).startsWith("/api/v1/treatment-plan?"))!;
    expect(path).toContain("type=dental_appliance");
    expect(path).toContain("limit=1");

    plans = [];
    expect((await mountPanel()).find(".patient-aside__oa").text()).toContain("No order yet");
  });

  it("the Device link asks the view to open that tab", async () => {
    const wrapper = await mountPanel();
    await wrapper.find(".patient-aside__oa .patient-aside__all").trigger("click");
    expect(wrapper.emitted("open-tab")).toEqual([["orthoapnea"]]);
  });

  it("lists the consent documents still to sign, and says so when all are signed", async () => {
    const wrapper = await mountPanel();
    const toSign = wrapper.find(".patient-aside__to-sign");
    expect(toSign.findAll("li")).toHaveLength(1);
    await toSign.find("button").trigger("click");
    expect(wrapper.emitted("open-study")).toEqual([["informedConsent", "document"]]);

    checklistItems = [item("informedConsent", "consent", "done")];
    expect((await mountPanel()).find(".patient-aside__to-sign").text()).toContain("Everything is signed");
  });

  it("'QR for the patient' emits qr, and is disabled when the patient has nothing left to fill", async () => {
    const wrapper = await mountPanel();
    await qrButton(wrapper).trigger("click");
    expect(wrapper.emitted("qr")).toHaveLength(1);

    checklistItems = [item("informedConsent", "consent", "done"), item("polysomnography", "results", "missing", false)];
    expect(qrButton(await mountPanel()).attributes("disabled")).toBeDefined();
  });

  it("hides its QR button on the Estudios tab, where that tab's own QR button already is", async () => {
    const wrapper = await mountPanel({ activeTab: "studies" });
    expect(qrButton(wrapper).exists()).toBe(false);
  });

  it("hides studies and documents to sign from roles without access to health data", async () => {
    const wrapper = await mountPanel({ canSeeStudies: false });
    expect(wrapper.find(".patient-aside__to-sign").exists()).toBe(false);
    expect(qrButton(wrapper).exists()).toBe(false);
    expect(apiFetch.mock.calls.some(([p]) => String(p).includes("/checklist"))).toBe(false);
  });

  it("shows the latest note only", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.findAll(".patient-aside__note")).toHaveLength(1);
    expect(wrapper.find(".patient-aside__note-body").text()).toBe("Latest note");
  });
});
