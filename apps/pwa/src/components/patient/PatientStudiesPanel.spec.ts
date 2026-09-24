import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const notify = vi.fn();
vi.mock("../../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

import "../FormRenderer.vue";
import { useAuthStore } from "../../stores/auth";
import PatientStudiesPanel from "./PatientStudiesPanel.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

const SLEEP_STUDY = {
  id: "ss-1", study_date: "2026-09-01", status: "interpreted", study_type: "polysomnography",
  ahi_score: 12, spo2_nadir: 88, odi: 9, interpretation: null,
};
const STOP_BANG_PENDING = {
  kind: "stop_bang", id: "sb-1", created_at: "2026-09-20T10:00:00Z", source: "patient", recorded_by_name: null,
  snoring: true, tiredness: true, observed_apnea: false, pressure: true,
  bmi_over_35: null, age_over_50: null, neck_circumference_over_40cm: null, is_male: null, score: null,
};
const ORAL_EXAM = {
  kind: "oral_exam", id: "oe-1", created_at: "2026-09-22T10:00:00Z", source: "staff", recorded_by_name: "Lorena González",
  has_bruxism: true, skeletal_class: "II", tooth: null,
};

let clinicalBody: unknown;

beforeEach(() => {
  clinicalBody = {
    records: [ORAL_EXAM, STOP_BANG_PENDING],
    pending_requests: [{ id: "qr-1", kind: "medical_history", expires_at: "2026-09-25T10:00:00Z", status: "pending" }],
  };
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/clinical-records")) return jsonResponse(true, 200, clinicalBody);
    if (path.includes("/sleep-study?")) return jsonResponse(true, 200, { items: [SLEEP_STUDY] });
    if (path.includes("/attachments")) return jsonResponse(true, 200, { items: [] });
    if (path.endsWith("/pdf")) return jsonResponse(true, 201, { id: "fa-1", filename: "stop-bang.pdf", url: "https://storage.test/signed" });
    if (path.endsWith("/questionnaire-requests") && init?.method === "POST") {
      const created = { id: "qr-2", kind: "stop_bang", status: "pending", expires_at: "2026-09-25T10:00:00Z" };
      (clinicalBody as { pending_requests: unknown[] }).pending_requests.push(created);
      return jsonResponse(true, 201, { ...created, url: `https://pwa.test/q#${"b".repeat(43)}` });
    }
    return jsonResponse(false, 404, { error: "unexpected" });
  });
});

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
  document.body.innerHTML = "";
});

async function mountPanel(role = "doctor"): Promise<VueWrapper> {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "doc@clinic.test", name: "Dra. Test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PatientStudiesPanel, { props: { patientId: "patient-1" }, attachTo: document.body, global: { plugins: [i18n, vuetify] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("PatientStudiesPanel — sleep studies + clinical questionnaires in one Estudios list", () => {
  it("merges sleep studies and questionnaires newest first, and shows links waiting for the patient", async () => {
    const wrapper = await mountPanel();
    const items = wrapper.findAll(".patient-studies-panel__item").map((li) => li.text());
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Oral cavity exam");
    expect(items[0]).toContain("Recorded by Lorena González");
    expect(items[0]).toContain("Yes: Bruxism, Skeletal class II");
    expect(items[1]).toContain("STOP-Bang questionnaire");
    expect(items[1]).toContain("Filled in by the patient");
    expect(items[2]).toContain("AHI 12");

    expect(wrapper.text()).toContain("Waiting for the patient");
    expect(wrapper.text()).toContain("Medical history");
  });

  it("a rep (commercial role) never loads or offers health questionnaires — sleep studies only", async () => {
    const wrapper = await mountPanel("rep");
    expect(apiFetch.mock.calls.some(([path]) => String(path).includes("clinical-records"))).toBe(false);
    expect(wrapper.findAll(".patient-studies-panel__item")).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Waiting for the patient");
  });

  it("flags a patient-answered STOP-Bang as missing B-A-N-G, with a Complete action instead of a score", async () => {
    const wrapper = await mountPanel();
    const stopBang = wrapper.findAll(".patient-studies-panel__item")[1]!;
    expect(stopBang.text()).toContain("B-A-N-G missing");
    expect(stopBang.text()).toContain("Complete B-A-N-G");
    expect(stopBang.text()).not.toContain("Score");
  });

  it("generates the PDF and opens it in a new tab", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const wrapper = await mountPanel();

    const pdfButton = wrapper.findAll(".patient-studies-panel__item")[1]!.findAll("button").find((b) => b.text() === "Generate PDF")!;
    await pdfButton.trigger("click");
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/clinical-records/stop_bang/sb-1/pdf", { method: "POST", handleErrors: false });
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.location.href).toBe("https://storage.test/signed");
    open.mockRestore();
  });

  it("'Patient fills in (QR)' creates a link and shows it as a QR code", async () => {
    const wrapper = await mountPanel();
    await wrapper.findAll("button").find((b) => b.text().includes("Add study"))!.trigger("click");
    await flushPromises();

    const qrItems = [...document.body.querySelectorAll(".v-list-item")].filter((el) => el.textContent?.includes("Patient fills in (QR)"));
    expect(qrItems).toHaveLength(2); // medical history + STOP-Bang; never the oral exam
    (qrItems[1] as HTMLElement).click();
    await flushPromises();
    await vi.waitFor(() => expect(document.body.querySelector(".qr-dialog__code")).not.toBeNull());

    const [, init] = apiFetch.mock.calls.find(([path, i]) => String(path).endsWith("/questionnaire-requests") && (i as RequestInit)?.method === "POST")!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ kind: "stop_bang" });
    expect(document.body.textContent).toContain("Scan to fill in");
    expect(document.body.textContent).toContain("Waiting for the patient to submit");

    // The patient submits: the request leaves the pending list on the next poll → "Received".
    (clinicalBody as { pending_requests: { id: string }[] }).pending_requests = [];
    await wrapper.findComponent({ name: "QuestionnaireQrDialog" }).vm.$emit("poll");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Received"));
  });
});
