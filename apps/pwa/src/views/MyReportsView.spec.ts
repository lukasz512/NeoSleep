import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import MyReportsView from "./MyReportsView.vue";
import { closeReportProblem, openReportProblem } from "../composables/useReportProblem";
import type { MyProblemReport } from "../types/issues";

/** Trackable reports: what a reporter sees of their own reports. */
const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  closeReportProblem();
  apiFetch.mockReset();
});

function report(overrides: Partial<MyProblemReport>): MyProblemReport {
  return {
    id: "r-1",
    number: 42,
    kind: "problem",
    description: "The calendar is empty after login.",
    status: "new",
    tracker_ref: null,
    reporter_reply: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function respond(items: MyProblemReport[]): void {
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items }) } as Response);
}

async function render(query = "") {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/my-reports", component: MyReportsView }] });
  await router.push(`/my-reports${query}`);
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(MyReportsView, { global: { plugins: [i18n, vuetify, router] } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("MyReportsView", () => {
  it("loads the caller's own reports from /problem-reports/mine", async () => {
    respond([]);
    await render();
    expect(apiFetch.mock.calls[0]![0]).toBe("/api/v1/problem-reports/mine");
  });

  it("shows an empty state that points at Feedback", async () => {
    respond([]);
    const wrapper = await render();
    expect(wrapper.text()).toContain("No reports yet");
    expect(wrapper.text()).toContain("Use Feedback in your account menu");
  });

  it("shows number, reporter-facing status, ticket and the team's reply", async () => {
    respond([
      report({ id: "r-2", number: 43, status: "resolved", tracker_ref: "CORE-123", reporter_reply: "Fixed in today's update." }),
      report({ id: "r-1", number: 42, status: "dismissed" }),
    ]);
    const wrapper = await render();
    const resolved = wrapper.get('[data-testid="my-report-43"]');
    expect(resolved.text()).toContain("Report #43");
    expect(resolved.get('[data-testid="my-report-status"]').text()).toBe("Resolved");
    expect(resolved.get('[data-testid="my-report-ticket"]').text()).toBe("Ticket CORE-123");
    expect(resolved.get('[data-testid="my-report-reply"]').text()).toContain("Fixed in today's update.");

    const dismissed = wrapper.get('[data-testid="my-report-42"]');
    expect(dismissed.get('[data-testid="my-report-status"]').text()).toBe("Won't fix");
    expect(dismissed.find('[data-testid="my-report-ticket"]').exists()).toBe(false);
    expect(dismissed.find('[data-testid="my-report-reply"]').exists()).toBe(false);
  });

  it("marks the report a notification or email linked to", async () => {
    respond([report({ id: "r-1", number: 42 }), report({ id: "r-2", number: 43 })]);
    const wrapper = await render("?report=r-2");
    expect(wrapper.get('[data-testid="my-report-43"]').classes()).toContain("view-my-reports__item--focused");
    expect(wrapper.get('[data-testid="my-report-42"]').classes()).not.toContain("view-my-reports__item--focused");
  });

  it("reloads after the Feedback dialog closes, so a new report shows at once", async () => {
    respond([]);
    await render();
    openReportProblem({});
    await flushPromises();
    respond([report({})]);
    closeReportProblem();
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
