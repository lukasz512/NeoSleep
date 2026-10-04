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
vi.mock("../../composables/useNotifications", () => ({
  useNotifications: () => ({ show: notify }),
  retryAction: (run: () => unknown) => ({ labelKey: "notification.action.retry", run }),
}));

import "../FormRenderer.vue";
import { useAuthStore } from "../../stores/auth";
import PatientChecklistPanel from "./PatientChecklistPanel.vue";
import QuestionnaireQrDialog from "../questionnaire/QuestionnaireQrDialog.vue";

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
  category: group === "results" ? "study" : "document",
  status,
  completed_at: null,
  history: [],
  pending_request_id: null,
  actions: actions(),
  ...over,
});

let checklistBody: Record<string, unknown>;
let failCreate = false;
let statusDelayMs = 0;

beforeEach(() => {
  failCreate = false;
  statusDelayMs = 0;
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
    // The content itself is the fingerprint here — any change to checklistBody moves it (NEO-173).
    if (path.endsWith("/checklist")) return jsonResponse(true, 200, { ...structuredClone(checklistBody), version: JSON.stringify(checklistBody) });
    if (path.endsWith("/checklist/version")) return jsonResponse(true, 200, { version: JSON.stringify(checklistBody) });
    if (path.endsWith("/opened") && init?.method === "POST") return jsonResponse(true, 204, null);
    if (path.endsWith("/print")) return jsonResponse(true, 200, null, "application/pdf");
    if (path.endsWith("/questionnaire-requests") && init?.method === "POST") {
      if (failCreate) return jsonResponse(false, 500, { error: "boom" });
      const created = { id: "qr-1", items: ["informedConsent", "stopBang"], completed_items: [], opened_at: null, expires_at: new Date(Date.now() + 86_400_000).toISOString() };
      (checklistBody.pending_requests as unknown[]).push(created);
      return jsonResponse(true, 201, { ...created, url: `https://pwa.test/q#${"b".repeat(43)}` });
    }
    if (path.endsWith("/questionnaire-requests/qr-1") && (init?.method ?? "GET") === "GET") {
      if (statusDelayMs) await new Promise((resolve) => setTimeout(resolve, statusDelayMs));
      const live = (checklistBody.pending_requests as { id: string }[]).find((r) => r.id === "qr-1");
      return jsonResponse(true, 200, live ? { status: "pending", ...live } : { id: "qr-1", status: "completed", items: [], completed_items: [], opened_at: null });
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

async function mountPanel(extraProps: Record<string, unknown> = {}): Promise<VueWrapper> {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "doc@clinic.test", name: "Dra. Test", role: "doctor" } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PatientChecklistPanel, { props: { patientId: "patient-1", ...extraProps }, attachTo: document.body, global: { plugins: [i18n, vuetify] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const rows = (wrapper: VueWrapper) => wrapper.findAll(".studies__item");
type Scope = Pick<VueWrapper, "findAll">;
const button = (scope: Scope, text: string) => scope.findAll("button").find((b) => b.text().includes(text));

describe("PatientChecklistPanel — the Estudios checklist", () => {
  it("shows every item grouped consent → patient → doctor → results, polysomnography last, with done/total", async () => {
    const wrapper = await mountPanel();
    expect(wrapper.findAll(".studies__group-title").map((h) => h.text())).toEqual(["Consent", "Completed by the patient", "Completed by the doctor", "Results"]);
    expect(rows(wrapper).map((r) => r.find(".studies__item-title").text())).toEqual([
      "Informed consent",
      "Medical history",
      "STOP-Bang questionnaire",
      "Oral cavity exam",
      "Clinical history",
      "Polysomnography",
    ]);
    expect(wrapper.text()).toContain("1 of 6 done");
  });

  // NEO-193: Documentos and Estudios are the same panel, each showing only its own items.
  it("category='document' shows consent + the Historia Clínica parts with the patient QR; no results, no other studies", async () => {
    (checklistBody.other_uploads as unknown[]).push({ id: "up-9", type: "upload", created_at: "2026-09-22T10:00:00Z", source: "staff", by: null, title: "CBCT", file_attachment_id: "up-9" });
    const wrapper = await mountPanel({ category: "document" });
    expect(rows(wrapper).map((r) => r.find(".studies__item-title").text())).toEqual([
      "Informed consent",
      "Medical history",
      "STOP-Bang questionnaire",
      "Oral cavity exam",
      "Clinical history",
    ]);
    expect(wrapper.text()).toContain("1 of 5 done");
    expect(wrapper.text()).not.toContain("CBCT");
    expect(wrapper.find(".studies__qr").exists()).toBe(true);
  });

  it("hideQrButton (desktop, the side panel has the QR — NEO-203) drops only the QR button; the email button stays", async () => {
    const wrapper = await mountPanel({ category: "document", hideQrButton: true });
    expect(wrapper.find(".studies__qr").exists()).toBe(false);
    expect(wrapper.find(".studies__compact-btn").exists()).toBe(true);
  });

  it("category='study' shows only results and other studies, without the patient QR or email", async () => {
    (checklistBody.other_uploads as unknown[]).push({ id: "up-9", type: "upload", created_at: "2026-09-22T10:00:00Z", source: "staff", by: null, title: "CBCT", file_attachment_id: "up-9" });
    const wrapper = await mountPanel({ category: "study" });
    expect(rows(wrapper).map((r) => r.find(".studies__item-title").text())).toEqual(["Polysomnography", "CBCT"]);
    expect(wrapper.text()).toContain("0 of 1 done");
    expect(wrapper.find(".studies__qr").exists()).toBe(false);
    expect(wrapper.find(".studies__add").exists()).toBe(true);
  });

  it("a done item shows its result instead of its buttons (actions move under ⋯); missing ones keep their buttons", async () => {
    const wrapper = await mountPanel();
    const [consent, history, stopBang, oralExam] = rows(wrapper);
    expect(history!.classes()).toContain("studies__item--done");
    expect(history!.text()).toContain("Filled in by the patient");
    // Result: yes/no counts + the positive answers as chips.
    expect(history!.find(".checklist-result__count--yes").text()).toBe("1Yes");
    expect(history!.findAll(".checklist-result__chip--yes").map((c) => c.text())).toEqual(["Diabetes"]);
    expect(button(history!, "Fill in")).toBeUndefined();
    expect(history!.find('[aria-label="More actions for Medical history"]').exists()).toBe(true);

    expect(consent!.classes()).toContain("studies__item--missing");
    expect(button(consent!, "QR")).toBeTruthy();
    // QR only on items the patient completes, never on the doctor's oral exam.
    expect(button(oralExam!, "QR")).toBeUndefined();
    expect(button(oralExam!, "Fill in")).toBeTruthy();
  });

  it("STOP-Bang with only S-T-O-P in shows the patient's part and keeps 'Complete B-A-N-G' on top", async () => {
    const wrapper = await mountPanel();
    const stopBang = rows(wrapper)[2]!;
    expect(stopBang.text()).toContain("B-A-N-G missing");
    expect(stopBang.find(".checklist-result__score").text()).toBe("1 / 4 S-T-O-P");
    // S answered yes; B-A-N-G not asked yet (dashed).
    expect(stopBang.findAll(".checklist-result__letters span").map((l) => l.classes().filter((c) => c !== "gap").join())).toEqual([
      "yes", "todo", "todo", "todo", "todo", "todo", "todo", "todo",
    ]);
    expect(button(stopBang, "Complete B-A-N-G")).toBeTruthy();
  });

  it("a done polysomnography shows AHI / SpO₂ / ODI and the OSA severity", async () => {
    const psg = (checklistBody.items as Record<string, unknown>[])[5]!;
    Object.assign(psg, {
      status: "done",
      history: [
        {
          id: "ss-1",
          type: "sleep_study",
          created_at: "2026-09-22T10:00:00Z",
          source: "staff",
          by: "Dra. López",
          sleep_study: { id: "ss-1", status: "interpreted", study_date: "2026-09-22", ahi_score: 18.4, spo2_nadir: 84, odi: 16.2, interpretation: null },
        },
      ],
    });
    const wrapper = await mountPanel();
    const row = rows(wrapper)[5]!;
    expect(row.text()).toContain("18.4");
    expect(row.text()).toContain("84 %");
    expect(row.text()).toContain("Moderate OSA");
    expect(row.find('[role="img"][aria-label="AHI 18.4 on the severity scale"]').exists()).toBe(true);
    expect(button(row, "Upload file")).toBeUndefined();
  });

  it("focusStudy (Estudios list row click, NEO-222) opens that sleep study once the checklist has loaded", async () => {
    const psg = (checklistBody.items as Record<string, unknown>[])[5]!;
    Object.assign(psg, {
      status: "done",
      history: [
        {
          id: "ss-1",
          type: "sleep_study",
          created_at: "2026-09-22T10:00:00Z",
          source: "staff",
          by: null,
          sleep_study: { id: "ss-1", status: "interpreted", study_date: "2026-09-22", ahi_score: 18.4, spo2_nadir: 84, odi: 16.2, interpretation: null },
        },
      ],
    });
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) =>
      path === "/api/v1/sleep-study/ss-1" ? jsonResponse(true, 200, { id: "ss-1", patient_id: "patient-1", status: "interpreted" }) : base(path, init)
    );
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has none
    await mountPanel({ category: "study", focusStudy: "ss-1" });
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/sleep-study/ss-1", expect.anything());
  });

  it("focusStudy that is not in the checklist opens nothing", async () => {
    await mountPanel({ category: "study", focusStudy: "ss-unknown" });
    expect(apiFetch).not.toHaveBeenCalledWith("/api/v1/sleep-study/ss-unknown", expect.anything());
  });

  it("a sleep study can still be deleted from the polysomnography history, after confirming", async () => {
    const psg = (checklistBody.items as Record<string, unknown>[])[5]!;
    Object.assign(psg, {
      status: "partial",
      history: [
        {
          id: "ss-2",
          type: "sleep_study",
          created_at: "2026-09-22T10:00:00Z",
          source: "staff",
          by: null,
          sleep_study: { id: "ss-2", status: "ordered", study_date: null, ahi_score: null, spo2_nadir: null, odi: null, interpretation: null },
        },
      ],
    });
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) =>
      path === "/api/v1/sleep-study/ss-2" && init?.method === "DELETE" ? jsonResponse(true, 204, null) : base(path, init)
    );
    const wrapper = await mountPanel();
    const row = rows(wrapper)[5]!;
    await button(row, "History (1)")!.trigger("click");
    await row.find('[aria-label="Remove"]').trigger("click");
    await flushPromises();
    expect(apiFetch).not.toHaveBeenCalledWith("/api/v1/sleep-study/ss-2", expect.anything()); // not before confirming

    const confirm = [...document.body.querySelectorAll(".pwa-confirm-dialog__card button")].find((b) => b.textContent?.includes("Remove")) as HTMLButtonElement;
    confirm.click();
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/sleep-study/ss-2", expect.objectContaining({ method: "DELETE" }));
    expect(notify).toHaveBeenCalledWith("Sleep study deleted", "success", undefined, expect.objectContaining({ icon: "nav-sleep-studies" }));
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
    // The dialog carries no tracking of its own (NEO-110) — only the button does.
    expect(document.body.querySelector(".qr-dialog__body")?.textContent).not.toContain("steps done");
    // The QR button itself now carries the status (NEO-93) — no separate banner.
    const status = wrapper.find(".qr-status");
    expect(status.attributes("data-state")).toBe("waiting");
    expect(status.text()).toContain("Waiting for the patient");
    expect(status.text()).toMatch(/0 of 2 · expires in (23:59:5\d|24:00:00)/);
    expect(wrapper.find(".studies__pending").exists()).toBe(false);
  });

  it("the side panel's QR request (qrRequestNonce) opens the everything-QR here, once per bump (NEO-153)", async () => {
    const wrapper = await mountPanel({ qrRequestNonce: 1 });
    const creates = () => apiFetch.mock.calls.filter(([path, i]) => String(path).endsWith("/questionnaire-requests") && (i as RequestInit)?.method === "POST");
    await vi.waitFor(() => expect(document.body.querySelector(".qr-dialog__code")).not.toBeNull());
    expect(creates()).toHaveLength(1);
    expect(JSON.parse((creates()[0]![1] as RequestInit).body as string)).toEqual({});
    await wrapper.setProps({ qrRequestNonce: 1 });
    await flushPromises();
    expect(creates()).toHaveLength(1);
  });

  it("tapping the button while the link is live opens its details, and only 'Show QR again' there issues a new link", async () => {
    const wrapper = await mountPanel();
    await button(wrapper, "QR for the patient")!.trigger("click");
    await flushPromises();
    const posts = () => apiFetch.mock.calls.filter(([path, i]) => String(path).endsWith("/questionnaire-requests") && (i as RequestInit)?.method === "POST").length;
    expect(posts()).toBe(1);

    await wrapper.find(".qr-status__main").trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(document.body.querySelector(".qr-status__menu")).not.toBeNull());
    expect(posts()).toBe(1); // opening the details never kills the patient's link
    expect(wrapper.find(".qr-status__main").attributes("aria-expanded")).toBe("true");

    const showAgain = [...document.body.querySelectorAll(".qr-status__menu button")].find((b) => b.textContent?.includes("Show QR again")) as HTMLButtonElement;
    showAgain.click();
    await flushPromises();
    expect(posts()).toBe(2);
  });

  it("a link that ran out unused shows 'New QR · Link expired …', and pressing it creates a fresh link", async () => {
    checklistBody.expired_request = { id: "qr-0", items: ["informedConsent", "stopBang"], completed_items: [], expires_at: "2026-09-20T10:00:00Z" };
    const wrapper = await mountPanel();
    const status = wrapper.find(".qr-status");
    expect(status.attributes("data-state")).toBe("expired");
    expect(status.text()).toContain("New QR");
    expect(status.text()).toContain("Link expired");

    checklistBody.expired_request = null;
    await button(wrapper, "New QR")!.trigger("click");
    await flushPromises();
    expect(apiFetch.mock.calls.some(([path, i]) => String(path).endsWith("/questionnaire-requests") && (i as RequestInit)?.method === "POST")).toBe(true);
    expect(wrapper.find(".qr-status").attributes("data-state")).toBe("waiting");
  });

  it("a failed link turns the QR button into Retry, and Retry creates the link", async () => {
    failCreate = true;
    const wrapper = await mountPanel();
    await button(wrapper, "QR for the patient")!.trigger("click");
    await flushPromises();
    expect(wrapper.find(".qr-status").attributes("data-state")).toBe("error");
    expect(wrapper.find(".qr-status").text()).toContain("Retry");

    failCreate = false;
    await button(wrapper, "Retry")!.trigger("click");
    await flushPromises();
    expect(wrapper.find(".qr-status").attributes("data-state")).toBe("waiting");
  });

  it("the QR dialog closes itself once the patient opens the link, and the button keeps refreshing (NEO-110)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const wrapper = await mountPanel();
      await button(wrapper, "QR for the patient")!.trigger("click");
      await flushPromises();
      expect(wrapper.findComponent(QuestionnaireQrDialog).props("modelValue")).toBe(true);

      await vi.advanceTimersByTimeAsync(15_000);
      await flushPromises();
      expect(wrapper.findComponent(QuestionnaireQrDialog).props("modelValue")).toBe(true); // not opened yet

      const pending = checklistBody.pending_requests as { opened_at: string | null; completed_items: string[] }[];
      pending[0]!.opened_at = new Date().toISOString();
      await vi.advanceTimersByTimeAsync(15_000);
      await flushPromises();
      expect(wrapper.findComponent(QuestionnaireQrDialog).props("modelValue")).toBe(false);

      pending[0]!.completed_items = ["informedConsent"];
      await vi.advanceTimersByTimeAsync(15_000);
      await flushPromises();
      expect(wrapper.find(".qr-status").text()).toContain("1 of 2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("while the QR is open: no check for 5 s, then every 2 s, closing within one check of the patient opening the link (NEO-117)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const wrapper = await mountPanel();
      await button(wrapper, "QR for the patient")!.trigger("click");
      await flushPromises();
      const statusCalls = () => apiFetch.mock.calls.filter(([path]) => String(path).endsWith("/questionnaire-requests/qr-1")).length;
      const dialogOpen = () => wrapper.findComponent(QuestionnaireQrDialog).props("modelValue");

      await vi.advanceTimersByTimeAsync(4_900);
      expect(statusCalls()).toBe(0); // the patient is still pointing the camera
      await vi.advanceTimersByTimeAsync(200);
      await flushPromises();
      expect(statusCalls()).toBe(1);
      await vi.advanceTimersByTimeAsync(4_000);
      await flushPromises();
      expect(statusCalls()).toBe(3);
      expect(dialogOpen()).toBe(true);

      (checklistBody.pending_requests as { opened_at: string | null }[])[0]!.opened_at = new Date().toISOString();
      await vi.advanceTimersByTimeAsync(2_000);
      await flushPromises();
      expect(dialogOpen()).toBe(false);

      const callsWhenClosed = statusCalls();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(statusCalls()).toBe(callsWhenClosed); // no fast checks once the dialog is gone
    } finally {
      vi.useRealTimers();
    }
  });

  it("a slow server doesn't stretch the rhythm: checks still start every 2 s, never two at once (NEO-123)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      statusDelayMs = 1_500; // each answer takes 1.5 s
      const wrapper = await mountPanel();
      await button(wrapper, "QR for the patient")!.trigger("click");
      await flushPromises();
      const statusCalls = () => apiFetch.mock.calls.filter(([path]) => String(path).endsWith("/questionnaire-requests/qr-1")).length;

      await vi.advanceTimersByTimeAsync(5_100);
      expect(statusCalls()).toBe(1); // at 5 s
      await vi.advanceTimersByTimeAsync(4_000);
      expect(statusCalls()).toBe(3); // at 7 s and 9 s — not 8.5 s and 12 s

      statusDelayMs = 3_000; // slower than the rhythm: the 2 s tick is skipped while one is in flight
      await vi.advanceTimersByTimeAsync(6_000);
      expect(statusCalls()).toBeLessThanOrEqual(5);
      expect(wrapper.findComponent(QuestionnaireQrDialog).exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the link leaving the pending list (patient finished) shows 'All received', then the button hides when nothing is left", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const wrapper = await mountPanel();
      await button(wrapper, "QR for the patient")!.trigger("click");
      await flushPromises();

      // The patient completes both steps: the link is used, and nothing is left to send.
      const body = checklistBody as { items: { key: string; status: string }[]; pending_requests: unknown[] };
      body.pending_requests = [];
      for (const it of body.items) if (it.status === "missing" || it.status === "pending_patient") it.status = "done";
      await vi.advanceTimersByTimeAsync(5_000); // the open QR dialog's first fast check (NEO-117)
      await flushPromises();
      expect(wrapper.find(".qr-status").attributes("data-state")).toBe("done");
      expect(wrapper.find(".qr-status").text()).toContain("All received");

      await vi.advanceTimersByTimeAsync(2300);
      expect(wrapper.find(".qr-status").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a 400 naming a field hands it to the Add-study form to mark, instead of a toast (NEO-109)", async () => {
    const wrapper = await mountPanel();
    const body = { error: "Invalid study_type 'x'", code: "VALIDATION_ERROR", field: "study_type", reason: "invalid" };
    const rejected = { ...jsonResponse(false, 400, body), clone: () => jsonResponse(false, 400, body) } as Response;
    apiFetch.mockImplementation(async () => rejected);
    const done = vi.fn();
    wrapper.findAllComponents({ name: "FormRenderer" })[0]!.vm.$emit("submit", { study_type: "x" }, done);
    await flushPromises();

    expect(done).toHaveBeenCalledWith(false, { study_type: "invalid" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("'Upload file' on a row preselects that item in the Add-study dialog", async () => {
    const wrapper = await mountPanel();
    await button(rows(wrapper)[5]!, "Upload file")!.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("Add study");
    expect((document.body.querySelector("#study-upload-title") as HTMLInputElement).value).toBe("Polysomnography");
  });

  it("the open tab checks the fingerprint every 15 s, link or not, and reloads only when it moved; the new row is highlighted (NEO-173)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const wrapper = await mountPanel();
      const calls = (suffix: string) => apiFetch.mock.calls.filter(([path]) => String(path).endsWith(suffix)).length;
      expect(calls("/checklist")).toBe(1);

      await vi.advanceTimersByTimeAsync(15_000);
      await flushPromises();
      expect([calls("/checklist/version"), calls("/checklist")]).toEqual([1, 1]); // nothing changed → no reload

      const items = checklistBody.items as ReturnType<typeof item>[];
      items[3] = item("oralExam", "doctor", "done", {
        actions: actions({ fill: "questionnaire", form: "oral_exam" }),
        history: [{ id: "oe-1", type: "record", created_at: "2026-09-28T10:00:00Z", source: "staff", by: "Dr. Other", is_new: true, record: { kind: "oral_exam", id: "oe-1", created_at: "2026-09-28T10:00:00Z", recorded_by_name: "Dr. Other", has_bruxism: true } }],
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await flushPromises();
      expect([calls("/checklist/version"), calls("/checklist")]).toEqual([2, 2]);
      expect(rows(wrapper)[3]!.classes()).toContain("studies__item--arrived");
      expect(rows(wrapper)[3]!.find("[data-testid='studies-new']").text()).toBe("New");
      expect(rows(wrapper)[1]!.classes()).not.toContain("studies__item--arrived");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows which colleagues already opened the result (NEO-173 B2)", async () => {
    const history = (checklistBody.items as ReturnType<typeof item>[])[1]!.history as Record<string, unknown>[];
    history[0]!.opened_by = [{ name: "Dra. Ana Ruiz", at: "2026-09-29T10:00:00Z" }, { name: "Dr. Luis Pérez", at: "2026-09-29T11:00:00Z" }];
    const wrapper = await mountPanel();
    expect(rows(wrapper)[1]!.find("[data-testid='studies-seen-by']").text()).toBe("Seen by Dra. Ana Ruiz, Dr. Luis Pérez");
    expect(rows(wrapper)[2]!.find("[data-testid='studies-seen-by']").exists()).toBe(false);
  });

  it("'New' goes away once I open that result, and the open is reported (NEO-173)", async () => {
    const history = (checklistBody.items as ReturnType<typeof item>[])[1]!.history as Record<string, unknown>[];
    history[0]!.is_new = true;
    const wrapper = await mountPanel();
    const row = rows(wrapper)[1]!;
    expect(row.find("[data-testid='studies-new']").exists()).toBe(true);

    await row.find('[aria-label="More actions for Medical history"]').trigger("click");
    await flushPromises();
    const view = [...document.body.querySelectorAll(".v-list-item")].find((el) => el.textContent?.includes("View")) as HTMLElement;
    view.click();
    await flushPromises();

    expect(row.find("[data-testid='studies-new']").exists()).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/checklist/entries/mh-1/opened", expect.objectContaining({ method: "POST" }));
  });
});
