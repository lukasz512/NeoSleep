import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import ReportDetailDialog from "./ReportDetailDialog.vue";
import type { ProblemReport } from "../../types/issues";

/** Trackable reports D2/D3: the admin links a ticket by hand and writes the reporter's reply. */
const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../../composables/useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  document.body.innerHTML = "";
});

const REPORT: ProblemReport = {
  id: "r-1",
  number: 42,
  tenant_slug: "neosleep",
  env: "production",
  kind: "problem",
  description: "The calendar is empty after login.",
  status: "new",
  reporter_user_id: "u-1",
  reporter_name: "QA Doctor",
  reporter_email: "qa@clinic.test",
  reporter_role: "doctor",
  page_url: "/calendar",
  app_version: "1.0.0",
  user_agent: null,
  viewport: null,
  request_ids: [],
  recent_errors: null,
  attachment_name: null,
  attachment_mime: null,
  attachment_size: null,
  has_attachment: false,
  admin_note: null,
  tracker_ref: null,
  reporter_reply: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render() {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(ReportDetailDialog, { props: { report: REPORT }, global: { plugins: [i18n, vuetify] }, attachTo: document.body });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

async function fill(testId: string, value: string) {
  const input = byTestId(testId)!.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
}

describe("ReportDetailDialog — ticket and reply", () => {
  it("blocks saving a ticket that isn't a ticket key", async () => {
    await render();
    await fill("report-tracker-ref", "fix later");
    expect(document.body.textContent).toContain("Use the ticket key, e.g. CORE-123.");
    expect(byTestId("report-save")!.hasAttribute("disabled")).toBe(true);
  });

  it("sends the ticket upper-cased and the reply trimmed", async () => {
    await render();
    await fill("report-tracker-ref", "core-123");
    await fill("report-reply", "  Fixed in today's update.  ");
    apiFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...REPORT, tracker_ref: "CORE-123" }) } as Response);
    byTestId("report-save")!.click();
    await flushPromises();

    const [path, init] = apiFetch.mock.calls.at(-1)! as [string, { method: string; body: string }];
    expect([path, init.method]).toEqual(["/api/v1/admin/problem-reports/r-1", "PATCH"]);
    expect(JSON.parse(init.body)).toMatchObject({ tracker_ref: "CORE-123", reporter_reply: "Fixed in today's update." });
  });

  it("says the internal note stays with admins and the reply goes to the reporter", async () => {
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Only admins see this.");
    expect(text).toContain("Sent by email when resolved or won't fix. No patient data.");
  });
});
