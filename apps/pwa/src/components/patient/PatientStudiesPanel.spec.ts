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
import PatientStudiesPanel from "./PatientStudiesPanel.vue";
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
  status,
  completed_at: null,
  history: [],
  pending_request_id: null,
  actions: actions(),
  ...over,
});

let checklistBody: Record<string, unknown>;
let failCreate = false;

beforeEach(() => {
  failCreate = false;
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
      if (failCreate) return jsonResponse(false, 500, { error: "boom" });
      const created = { id: "qr-1", items: ["informedConsent", "stopBang"], completed_items: [], opened_at: null, expires_at: new Date(Date.now() + 86_400_000).toISOString() };
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
      await vi.advanceTimersByTimeAsync(15_000); // the panel's own refresh while the link is live
      await flushPromises();
      expect(wrapper.find(".qr-status").attributes("data-state")).toBe("done");
      expect(wrapper.find(".qr-status").text()).toContain("All received");

      await vi.advanceTimersByTimeAsync(2300);
      expect(wrapper.find(".qr-status").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("'Upload file' on a row preselects that item in the Add-study dialog", async () => {
    const wrapper = await mountPanel();
    await button(rows(wrapper)[5]!, "Upload file")!.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("Add study");
    expect((document.body.querySelector("#study-upload-title") as HTMLInputElement).value).toBe("Polysomnography");
  });
});
