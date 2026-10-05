import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import { useAuthStore } from "../stores/auth";
import { closeReportProblem, openReportProblem } from "../composables/useReportProblem";
import ReportProblemDialog from "./ReportProblemDialog.vue";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  closeReportProblem();
  apiFetch.mockReset();
  notify.mockReset();
  document.body.innerHTML = "";
});

async function open(role = "rep", prefill: { requestId?: string } = {}) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(ReportProblemDialog, { global: { plugins: [i18n, vuetify] }, attachTo: document.body });
  wrappers.push(wrapper);
  openReportProblem(prefill);
  await flushPromises();
  return wrapper;
}

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function type(text: string) {
  const textarea = byTestId("report-description")!.querySelector("textarea")!;
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
}

describe("ReportProblemDialog", () => {
  it("blocks a description shorter than 10 characters and sends nothing", async () => {
    await open();
    await type("too short");
    byTestId("report-submit")!.click();
    await flushPromises();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Please write at least 10 characters.");
  });

  it("sends the report and announces its number", async () => {
    await open("rep", { requestId: "abcdef1234567890" });
    expect(byTestId("report-reference")?.textContent).toContain("abcdef12");
    await type("The patient list never finishes loading");
    apiFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "r-1", number: 123 }) } as Response);
    byTestId("report-submit")!.click();
    await flushPromises();

    const [path, init] = apiFetch.mock.calls.at(-1)! as [string, { method: string; body: FormData }];
    expect([path, init.method]).toEqual(["/api/v1/problem-reports", "POST"]);
    expect(init.body.get("kind")).toBe("problem");
    expect(init.body.get("description")).toBe("The patient list never finishes loading");
    expect(JSON.parse(String(init.body.get("request_ids")))).toContain("abcdef1234567890");
    expect(notify).toHaveBeenCalledWith("Thanks — report #123 sent", "success", undefined, expect.anything());
  });

  it("words a rate limit in plain language", async () => {
    await open();
    await type("The patient list never finishes loading");
    apiFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) } as Response);
    byTestId("report-submit")!.click();
    await flushPromises();
    expect(byTestId("report-submit-error")?.textContent).toContain("several reports");
    expect(notify).not.toHaveBeenCalled();
  });

  it("is called Feedback for every role (D3)", async () => {
    await open("rep");
    expect(byTestId("app-dialog-header-title")?.textContent).toBe("Feedback");
  });
});
