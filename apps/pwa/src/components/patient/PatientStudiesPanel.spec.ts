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

function jsonResponse(ok: boolean, status: number, body: unknown, contentType = "application/json") {
  return {
    ok,
    status,
    headers: { get: () => contentType },
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob(["%PDF-"], { type: "application/pdf" }),
  } as unknown as Response;
}

const actions = (over: Partial<Record<string, unknown>> = {}) => ({ qr: false, fill: null, form: null, print: true, upload: true, ...over });
const item = (key: string, group: string, status: string, over: Record<string, unknown> = {}) => ({
  key,
  templateKey: key === "polysomnography" ? null : key,
  label: key,
  fillMode: group === "results" ? "external" : group,
  group,
  status,
  completed_at: null,
  history: [],
  pending_request_id: null,
  actions: actions(),
  ...over,
});

let checklistBody: Record<string, unknown>;

beforeEach(() => {
  checklistBody = {
    items: [
      item("informedConsent", "consent", "missing", { actions: actions({ qr: true }) }),
      item("medicalHistory", "patient", "done", {
        actions: actions({ qr: true, fill: "questionnaire", form: "medical_history" }),
        history: [
          {
            id: "mh-1",
            type: "record",
            created_at: "2026-09-20T10:00:00Z",
            source: "patient",
            by: null,
            record: { kind: "medical_history", id: "mh-1", created_at: "2026-09-20T10:00:00Z", source: "patient", recorded_by_name: null, has_diabetes: true },
          },
        ],
      }),
      item("stopBang", "patient", "partial", {
        actions: actions({ qr: true, fill: "questionnaire", form: "stop_bang" }),
        history: [
          {
            id: "sb-1",
            type: "record",
            created_at: "2026-09-21T10:00:00Z",
            source: "patient",
            by: null,
            record: { kind: "stop_bang", id: "sb-1", created_at: "2026-09-21T10:00:00Z", source: "patient", recorded_by_name: null, score: null, snoring: true },
          },
        ],
      }),
      item("oralExam", "doctor", "missing", { actions: actions({ fill: "questionnaire", form: "oral_exam" }) }),
      item("historiaEndo", "doctor", "missing"),
      item("polysomnography", "results", "missing", { actions: actions({ fill: "sleep_study", print: false }) }),
    ],
    other_uploads: [],
    pending_requests: [],
    summary: { done: 1, total: 6 },
  };
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/checklist")) return jsonResponse(true, 200, structuredClone(checklistBody));
    if (path.endsWith("/print")) return jsonResponse(true, 200, null, "application/pdf");
    if (path.endsWith("/questionnaire-requests") && init?.method === "POST") {
      const created = { id: "qr-1", items: ["informedConsent", "stopBang"], completed_items: [], expires_at: "2026-09-26T10:00:00Z" };
      (checklistBody.pending_requests as unknown[]).push(created);
      return jsonResponse(true, 201, { ...created, url: `https://pwa.test/q#${"b".repeat(43)}` });
    }
    if (path.endsWith("/studies/uploads")) return jsonResponse(true, 201, { id: "up-1" });
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

async function mountPanel(): Promise<VueWrapper> {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "doc@clinic.test", name: "Dra. Test", role: "doctor" } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PatientStudiesPanel, { props: { patientId: "patient-1" }, attachTo: document.body, global: { plugins: [i18n, vuetify] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const rows = (wrapper: VueWrapper) => wrapper.findAll(".studies__item");
type Scope = Pick<VueWrapper, "findAll">;
const button = (scope: Scope, text: string) => scope.findAll("button").find((b) => b.text().includes(text));

describe("PatientStudiesPanel — the Estudios checklist", () => {
  it("shows every item grouped consent → patient → doctor → results, polysomnography last, with done/total", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.findAll(".studies__group-title").map((h) => h.text())).toEqual(["Consent", "Completed by the patient", "Completed by the doctor", "Results"]);
    expect(rows(wrapper).map((r) => r.find(".studies__item-title").text())).toEqual([
      "Informed consent",
      "Medical history",
      "STOP-Bang questionnaire",
      "Oral cavity exam",
      "Historia Endo (endodontic record)",
      "Polysomnography",
    ]);
    expect(wrapper.text()).toContain("1 of 6 done");
  });

  it("highlights done items, shows the findings and who filled it; missing ones stay plain", async () => {
    const wrapper = await mountPanel();
    const [consent, history, stopBang, oralExam] = rows(wrapper);
    expect(history!.classes()).toContain("studies__item--done");
    expect(history!.text()).toContain("Filled in by the patient");
    expect(history!.text()).toContain("Yes: Diabetes");
    expect(consent!.classes()).toContain("studies__item--missing");
    expect(stopBang!.text()).toContain("B-A-N-G missing");
    expect(button(stopBang!, "Complete B-A-N-G")).toBeTruthy();
    // QR only on items the patient completes, never on the doctor's oral exam.
    expect(button(oralExam!, "QR")).toBeUndefined();
  });

  it("prints an item as a PDF opened in a new tab", async () => {
    const tab = { location: { href: "" }, close: vi.fn(), opener: {} };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf-1");
    const wrapper = await mountPanel();

    await button(rows(wrapper)[4]!, "Print")!.trigger("click");
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/checklist/historiaEndo/print", expect.objectContaining({ method: "POST" }));
    expect(tab.location.href).toBe("blob:pdf-1");
    expect(tab.opener).toBeNull();
    open.mockRestore();
    createObjectURL.mockRestore();
  });

  it("'QR for the patient' creates one link for everything left and shows its step progress", async () => {
    const wrapper = await mountPanel();
    await button(wrapper, "QR for the patient")!.trigger("click");
    await flushPromises();

    const [, init] = apiFetch.mock.calls.find(([path, i]) => String(path).endsWith("/questionnaire-requests") && (i as RequestInit)?.method === "POST")!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({}); // no items → everything still missing
    await vi.waitFor(() => expect(document.body.querySelector(".qr-dialog__code")).not.toBeNull());
    expect(document.body.textContent).toContain("0 of 2 steps done");
    expect(wrapper.text()).toContain("Waiting for the patient");
  });

  it("'Upload file' on a row preselects that item in the Add-study dialog", async () => {
    const wrapper = await mountPanel();
    await button(rows(wrapper)[5]!, "Upload file")!.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("Add study");
    expect((document.body.querySelector("#study-upload-title") as HTMLInputElement).value).toBe("Polysomnography");
  });
});
