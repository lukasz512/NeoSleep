import { describe, it, expect, vi, afterEach } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createRouter, createMemoryHistory } from "vue-router";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import DeviceOrderReconciliationCard from "./DeviceOrderReconciliationCard.vue";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
});

function mountCard(mode: "full" | "counter" = "full"): VueWrapper {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { template: "<div/>" } }] });
  const w = mount(DeviceOrderReconciliationCard, { props: { mode }, global: { plugins: [i18n, vuetify, router] } });
  mounted.push(w);
  return w;
}

const MISMATCH = {
  environment: "prod",
  counter: { status: "mismatch", matchLevel: 0.5, matched: 1, mismatches: 1, finishedAt: "2026-10-04T13:00:05Z" },
  run: {
    id: "r1",
    trigger: "scheduled",
    status: "mismatch",
    summary: { oursSent: 2, labTotal: 3, matched: 1, mismatches: 1, info: 1, matchLevel: 0.5 },
    error: null,
    finished_at: "2026-10-04T13:00:05Z",
    items: [
      { reason: "matched", externalId: "1", treatmentPlanId: "tp1", patientId: "p1", patientName: "Ana", labStatus: "1", requestDate: null, drift: [] },
      {
        reason: "field_drift",
        externalId: "2",
        treatmentPlanId: "tp2",
        patientId: "p2",
        patientName: "Luis",
        labStatus: "1",
        requestDate: null,
        drift: [{ field: "protrusionMax", ours: "6", lab: "3" }],
      },
      { reason: "outside", externalId: "3", treatmentPlanId: null, patientId: null, patientName: "Eva", labStatus: "6", requestDate: "2026-08-20T19:50:51", drift: [] },
    ],
  },
};

describe("DeviceOrderReconciliationCard", () => {
  it("never checked: says so and offers Check now", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { environment: "dev", counter: null, run: null }));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="dor-when"]').text()).toBe("Not checked yet"));
    expect(w.find('[data-testid="dor-state"]').text()).toBe("No data");
    expect(w.find('[data-testid="dor-check-now"]').exists()).toBe(true);
  });

  it("admin mismatch: level, counts, the changed field ours → lab, explained orders apart, matched not listed", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, MISMATCH));
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="dor-percent"]').text()).toContain("50"));
    expect(w.find('[data-testid="dor-state"]').text()).toBe("Needs a look");
    const attention = w.find('[data-testid="dor-attention"]').text();
    expect(attention).toContain("Changed in the lab");
    expect(attention).toContain("Max. protrusion");
    expect(attention).toMatch(/6\s*→\s*3/);
    expect(attention).not.toContain("Ana");
    expect(w.find('[data-testid="dor-explained"]').text()).toContain("Placed outside NeoSleep");
    expect(w.text()).not.toMatch(/orthoapnea/i);
  });

  it("Check now runs a check, then reloads the latest result", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse(true, { environment: "prod", counter: null, run: null }))
      .mockResolvedValueOnce(jsonResponse(true, { run: MISMATCH.run }))
      .mockResolvedValueOnce(jsonResponse(true, MISMATCH));
    const w = mountCard();
    // Let the first load finish (the button is disabled while it is in flight).
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await flushPromises();
    await w.find('[data-testid="dor-check-now"]').trigger("click");
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    await flushPromises();
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/device-orders/reconciliation/run", { method: "POST", handleErrors: false });
    expect(w.find('[data-testid="dor-percent"]').text()).toContain("50");
  });

  it("a failed check shows a plain message, never the raw error", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, {
        environment: "prod",
        counter: { status: "failed", matchLevel: null, matched: 0, mismatches: 0, finishedAt: "2026-10-04T13:00:05Z" },
        run: { ...MISMATCH.run, status: "failed", items: [], error: "orthoapnea: order list answered 500", summary: { oursSent: 2 } },
      })
    );
    const w = mountCard();
    await vi.waitFor(() => expect(w.find('[data-testid="dor-failed"]').exists()).toBe(true));
    expect(w.text()).not.toContain("answered 500");
    expect(w.text()).not.toMatch(/orthoapnea/i);
  });

  it("manager counter: state and level only — no button, no counts, no orders", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { environment: "prod", counter: MISMATCH.counter }));
    const w = mountCard("counter");
    await vi.waitFor(() => expect(w.find('[data-testid="dor-percent"]').exists()).toBe(true));
    expect(w.find('[data-testid="dor-check-now"]').exists()).toBe(false);
    expect(w.find('[data-testid="dor-counts"]').exists()).toBe(false);
    expect(w.find('[data-testid="dor-attention"]').exists()).toBe(false);
  });
});
