import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
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

import LabOrderSyncCard from "./LabOrderSyncCard.vue";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
});

function mountCard(): VueWrapper {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { template: "<div/>" } }] });
  const w = mount(LabOrderSyncCard, { global: { plugins: [i18n, vuetify, router] } });
  mounted.push(w);
  return w;
}

const RUN = {
  id: "r1",
  trigger: "manual",
  startedAt: "2026-10-05T10:00:00Z",
  finishedAt: "2026-10-05T10:00:03Z",
  checked: 3,
  changed: 1,
  failed: 0,
  error: null,
};

const WITH_ORDERS = {
  runs: [
    RUN,
    { ...RUN, id: "r0", trigger: "schedule", startedAt: "2026-10-05T06:00:00Z", checked: 2, changed: 0 },
  ],
  openOrders: [
    {
      treatmentPlanId: "tp1",
      patientId: "p1",
      patientName: "Ana Lopez",
      externalId: "454012",
      externalStatus: "1",
      lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      syncStatus: "synced",
    },
  ],
  totalLinks: 1,
};

describe("LabOrderSyncCard", () => {
  it("renders the last run with its trigger and counts, recent runs, and the open orders", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, WITH_ORDERS));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="sync-open-orders"]').exists()).toBe(true));

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/partners/orthoapnea/sync-status", expect.anything());
    expect(w.find('[data-testid="sync-when"]').text()).toContain("Manual");
    const counts = w.find('[data-testid="sync-counts"]').text();
    expect(counts).toContain("3");
    expect(counts).toContain("1");
    expect(w.find('[data-testid="sync-runs"]').text()).toContain("Schedule");

    const table = w.find('[data-testid="sync-open-orders"]');
    expect(table.text()).toContain("Ana Lopez");
    expect(table.text()).toContain("454012");
    expect(table.text()).toContain("Request sent");
    expect(table.find("a").attributes("href")).toBe("/patients/p1");
  });

  it("shows the run error when the last run failed", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, { runs: [{ ...RUN, checked: null, changed: null, failed: null, error: "lab unreachable" }], openOrders: [], totalLinks: 2 })
    );
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="sync-run-error"]').exists()).toBe(true));
    expect(w.find('[data-testid="sync-run-error"]').text()).toContain("lab unreachable");
  });

  it("explains an empty list: nothing was ever sent versus nothing open", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { runs: [], openOrders: [], totalLinks: 0 }));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="sync-empty"]').exists()).toBe(true));
    expect(w.find('[data-testid="sync-when"]').text()).toBe("The sync has not run yet");
    expect(w.find('[data-testid="sync-empty"]').text()).toBe("No orders have been sent to the lab from the app yet.");
    w.unmount();

    apiFetch.mockResolvedValueOnce(jsonResponse(true, { runs: [RUN], openOrders: [], totalLinks: 4 }));
    const w2 = mountCard();
    await vi.waitFor(() => expect(w2.find('[data-testid="sync-empty"]').exists()).toBe(true));
    expect(w2.find('[data-testid="sync-empty"]').text()).toContain("No open orders right now");
  });

  it("never names the partner on screen", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, WITH_ORDERS));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="sync-open-orders"]').exists()).toBe(true));
    expect(w.text()).not.toMatch(/orthoapnea|biologix/i);
  });

  it("Check now posts to the sync endpoint and reloads", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse(true, { runs: [], openOrders: [], totalLinks: 0 }))
      .mockResolvedValueOnce(jsonResponse(true, { checked: 3, changed: 1, failed: 0 }))
      .mockResolvedValueOnce(jsonResponse(true, WITH_ORDERS));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="sync-empty"]').exists()).toBe(true));

    await w.find('[data-testid="sync-check-now"]').trigger("click");
    await vi.waitFor(() => expect(w.find('[data-testid="sync-open-orders"]').exists()).toBe(true));

    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/partners/orthoapnea/sync-statuses/now", expect.objectContaining({ method: "POST" }));
    expect(apiFetch).toHaveBeenNthCalledWith(3, "/api/v1/partners/orthoapnea/sync-status", expect.anything());
    expect(w.find('[data-testid="sync-when"]').text()).toContain("Manual");
  });

  it("shows an error when Check now fails, and still reloads", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse(true, { runs: [], openOrders: [], totalLinks: 0 }))
      .mockResolvedValueOnce(jsonResponse(false, {}))
      .mockResolvedValueOnce(jsonResponse(true, { runs: [{ ...RUN, error: "boom", checked: null, changed: null, failed: null }], openOrders: [], totalLinks: 0 }));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="sync-empty"]').exists()).toBe(true));

    await w.find('[data-testid="sync-check-now"]').trigger("click");
    await vi.waitFor(() => expect(w.find('[data-testid="sync-check-error"]').exists()).toBe(true));
    await vi.waitFor(() => expect(w.find('[data-testid="sync-run-error"]').exists()).toBe(true));
  });
});
