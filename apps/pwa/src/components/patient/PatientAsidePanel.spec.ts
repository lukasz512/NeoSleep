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

beforeEach(() => {
  checklistItems = [item("informedConsent", "consent", "missing"), item("medicalHistory", "patient", "done"), item("polysomnography", "results", "done", false)];
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/v1/note?")) {
      return ok({ items: [{ id: "n1", entity_type: "patient", entity_id: "p-1", author_id: "u-1", author_name: "Rep One", body: "Latest note", created_at: "2026-09-24T10:00:00Z" }] });
    }
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

describe("PatientAsidePanel (NEO-153, NEO-203)", () => {
  it("opens with the next-step card, the QR button inside it", async () => {
    const wrapper = await mountPanel();
    const first = wrapper.find(".patient-aside").element.firstElementChild;
    expect(first?.classList.contains("patient-aside__next")).toBe(true);
    expect(wrapper.find(".patient-aside__next .patient-aside__qr").exists()).toBe(true);
  });

  it("names what the patient still has to fill in", async () => {
    const next = (await mountPanel()).find(".patient-aside__next");
    expect(next.text()).toContain("Waiting on the patient: 1");
    expect(next.find(".patient-aside__next-items").text()).toBe("Informed consent");
  });

  it("'QR for the patient' emits qr; with nothing left for the patient it is disabled and says All done", async () => {
    const wrapper = await mountPanel();
    await qrButton(wrapper).trigger("click");
    expect(wrapper.emitted("qr")).toHaveLength(1);

    checklistItems = [item("informedConsent", "consent", "done"), item("polysomnography", "results", "missing", false)];
    const done = await mountPanel();
    expect(qrButton(done).attributes("disabled")).toBeDefined();
    expect(qrButton(done).text()).toContain("All done");
    expect(done.find(".patient-aside__next").text()).toContain("Nothing left for the patient");
  });

  it("keeps its QR button on every tab — on desktop the Documentos tab drops its own instead (NEO-203)", async () => {
    for (const activeTab of ["details", "documents", "studies"]) {
      expect(qrButton(await mountPanel({ activeTab })).exists()).toBe(true);
    }
  });

  it("does not show the OrthoApnea card nor load the order", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find(".patient-aside__oa").exists()).toBe(false);
    expect(apiFetch.mock.calls.some(([p]) => String(p).includes("/treatment-plan"))).toBe(false);
  });

  it("shows the key facts as one line under the next-step card", async () => {
    const wrapper = await mountPanel();
    const facts = wrapper.find(".patient-aside__facts");
    expect(facts.element.previousElementSibling?.classList.contains("patient-aside__next")).toBe(true);
    expect(facts.find(".patient-aside__diagnosis").text()).toBe("G47.33 · OSA");
    expect(facts.text()).toContain("AHI 32");
    expect(facts.find("a").text()).toBe("Dr Marta Nowak");

    const empty = await mountPanel({ patient: { id: "p-1", diagnosis_code: null } });
    expect(empty.find(".patient-aside__diagnosis").exists()).toBe(false);
  });

  it("lists unfinished documents first and cuts the list at 6 rows with a link to the rest", async () => {
    checklistItems = [
      item("medicalHistory", "patient", "done"),
      item("stopBang", "patient", "done"),
      item("oralExam", "doctor", "done"),
      item("historiaEndo", "doctor", "done"),
      item("polysomnography", "results", "done", false),
      item("extra1", "results", "done", false),
      item("informedConsent", "consent", "missing"),
      item("extra2", "results", "missing", false),
    ];
    const wrapper = await mountPanel();
    const rows = wrapper.findAll(".patient-aside__docs li");
    // NEO-231 D2: the three Historia clínica sections + the printable HC are one row.
    expect(rows.map((r) => r.text())).toEqual(["Informed consent", "extra2", "Clinical history · 3/3", "Polysomnography", "extra1"]);
    await rows[0]!.find("button").trigger("click");
    expect(wrapper.emitted("open-study")).toEqual([["informedConsent", "document"]]);

    await wrapper.find(".patient-aside__docs .patient-aside__all").trigger("click");
    expect(wrapper.emitted("open-tab")).toEqual([["documents"]]);
  });

  it("with 6 documents or fewer shows them all and no 'see all' link", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.findAll(".patient-aside__docs li")).toHaveLength(3);
    expect(wrapper.find(".patient-aside__docs .patient-aside__all").exists()).toBe(false);
  });

  it("hides the next step and the documents from roles without access to health data", async () => {
    const wrapper = await mountPanel({ canSeeStudies: false });
    expect(wrapper.find(".patient-aside__next").exists()).toBe(false);
    expect(wrapper.find(".patient-aside__docs").exists()).toBe(false);
    expect(wrapper.find(".patient-aside__facts").exists()).toBe(true);
    expect(apiFetch.mock.calls.some(([p]) => String(p).includes("/checklist"))).toBe(false);
  });

  it("shows the latest note only", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.findAll(".patient-aside__note")).toHaveLength(1);
    expect(wrapper.find(".patient-aside__note-body").text()).toBe("Latest note");
  });
});
