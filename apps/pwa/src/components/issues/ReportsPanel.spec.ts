import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import ReportsPanel from "./ReportsPanel.vue";
import type { ProblemReport } from "../../types/issues";

/** CORE-227: reports use the same state chip and counters as errors, and follow their linked error. */
const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../../composables/useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

function report(number: number, patch: Partial<ProblemReport> = {}): ProblemReport {
  const now = new Date().toISOString();
  return {
    id: `r${number}`,
    number,
    tenant_slug: "neosleep",
    env: "prod",
    kind: "problem",
    description: `report ${number}`,
    status: "new",
    reporter_user_id: null,
    reporter_name: "Ana",
    reporter_email: null,
    reporter_role: "doctor",
    page_url: null,
    app_version: null,
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
    created_at: now,
    updated_at: now,
    linked_error: null,
    ...patch,
  };
}

let items: ProblemReport[];
const wrappers: VueWrapper[] = [];

beforeEach(() => {
  items = [
    report(1),
    report(2, { status: "in_progress" }),
    report(3, { linked_error: { status: "open", ticket_status: "needs_review", blocked: false } }),
    report(4, { status: "resolved", resolved_at: new Date().toISOString() }),
    report(5, { status: "dismissed" }),
  ];
  apiFetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ items }) }) as Response);
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  document.body.innerHTML = "";
});

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const rowNumbers = () => [...document.body.querySelectorAll<HTMLElement>("[data-testid^='report-row-']")].map((el) => Number(el.dataset.testid!.replace("report-row-", "")));
const chipOf = (number: number) => byTestId(`report-item-${number}`)!.querySelector<HTMLElement>("[data-testid^='issue-state-']")!.dataset.testid;

async function render(reportId: string | null = null) {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(ReportsPanel, { props: { reportId }, global: { plugins: [i18n, vuetify] }, attachTo: document.body });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("ReportsPanel", () => {
  it("loads every report once and shows the open ones with one state chip each", async () => {
    await render();
    expect(apiFetch.mock.calls[0]![0]).toBe("/api/v1/admin/problem-reports");
    expect(rowNumbers()).toEqual([1, 2, 3]);
    expect([1, 2, 3].map(chipOf)).toEqual(["issue-state-new", "issue-state-being_fixed", "issue-state-artifact_ready"]);
  });

  it("counts the same four buckets as errors and a counter filters the list", async () => {
    await render();
    const numbers = ["new", "fixing", "ready", "done"].map((b) => byTestId(`issue-counter-${b}`)!.querySelector(".issue-counters__number")!.textContent);
    expect(numbers).toEqual(["1", "1", "1", "1"]);

    byTestId("issue-counter-done")!.click();
    await flushPromises();
    expect(rowNumbers()).toEqual([4]);

    byTestId("issue-counter-all")!.click();
    await flushPromises();
    expect(rowNumbers()).toEqual([1, 2, 3, 4, 5]);
  });

  it("widens to all when the linked report is one the default view hides", async () => {
    await render("r5");
    expect(rowNumbers()).toContain(5);
  });

  it("says what was checked when nobody reported anything", async () => {
    items = [];
    await render();
    const text = byTestId("reports-empty")!.textContent ?? "";
    expect(text).toContain("No reports yet");
    expect(text).toMatch(/Checked at \d/);
  });
});
