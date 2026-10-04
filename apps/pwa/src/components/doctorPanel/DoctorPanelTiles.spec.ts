import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
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

import DoctorPanelTiles from "./DoctorPanelTiles.vue";

/**
 * NEO-233 Doctor Panel tiles ① Today + ② Needs your action
 * (docs/stories/doctor-panel-today-and-actions.md).
 */

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const NOW = new Date("2026-10-05T08:00:00");
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).toISOString();

const APPOINTMENTS = {
  items: [
    { id: "a1", patient_id: "p1", patient_name: "Ana Ruiz", organization_name: "Clínica Norte", status: "scheduled", start_at: at(5, 10), end_at: at(5, 11), patient_response: "confirmed", confirm_request_sent_at: at(3, 9) },
    { id: "a2", patient_id: "p2", patient_name: "Luis Paz", organization_name: null, status: "scheduled", start_at: at(6, 9), end_at: at(6, 10), patient_response: null, confirm_request_sent_at: at(4, 9) },
    { id: "a3", patient_id: "p3", patient_name: "Eva Gil", organization_name: null, status: "cancelled", start_at: at(5, 12), end_at: at(5, 13), patient_response: null, confirm_request_sent_at: null },
  ],
};

const ACTIONS = {
  enabled: true,
  items: [
    { kind: "results_to_interpret", patient_id: "p1", patient_name: "Ana Ruiz", ref_id: "s1", at: at(4, 9) },
    { kind: "cannot_attend", patient_id: "p4", patient_name: "Raúl Sol", ref_id: "a9", at: at(7, 9) },
    { kind: "plan_not_notified", patient_id: "p5", patient_name: "Mia Paz", ref_id: "t1", at: at(1, 9) },
    { kind: "consent_missing", patient_id: "p6", patient_name: "Leo Ríos", ref_id: "informedConsent", at: null },
  ],
};

/** Answers each endpoint the tiles call; `actions` = the doctor-panel payload. */
function serve(actions: unknown, appointments: unknown = APPOINTMENTS) {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/v1/doctor-panel/actions")) return jsonResponse(actions);
    if (path.startsWith("/api/v1/appointments")) return jsonResponse(appointments);
    throw new Error(`unexpected ${path}`);
  });
}

const mounted: VueWrapper[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
  vi.useRealTimers();
});

function mountTiles(): VueWrapper {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/patients/:id", name: "patient-detail", component: { template: "<div/>" } },
      { path: "/calendar", name: "calendar", component: { template: "<div/>" } },
      { path: "/:p(.*)*", component: { template: "<div/>" } },
    ],
  });
  const w = mount(DoctorPanelTiles, { global: { plugins: [i18n, vuetify, router] } });
  mounted.push(w);
  return w;
}

describe("DoctorPanelTiles", () => {
  it("switched off: renders nothing and never asks for appointments", async () => {
    serve({ enabled: false, items: [] });
    const w = mountTiles();
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(w.find('[data-testid="doctor-panel"]').exists()).toBe(false);
    expect(apiFetch.mock.calls.some(([p]) => String(p).startsWith("/api/v1/appointments"))).toBe(false);
  });

  it("Today asks for today + tomorrow (local days) and lists live visits by day, with the patient's answer", async () => {
    serve(ACTIONS);
    const w = mountTiles();
    await vi.waitFor(() => expect(w.findAll('[data-testid="doctor-panel-visit"]')).toHaveLength(2));
    const call = apiFetch.mock.calls.find(([p]) => String(p).startsWith("/api/v1/appointments"))![0] as string;
    const params = new URL(call, "http://x").searchParams;
    expect(new Date(params.get("start")!).getTime()).toBe(new Date(2026, 9, 5).getTime());
    expect(new Date(params.get("end")!).getTime()).toBe(new Date(2026, 9, 7).getTime());

    const visits = w.findAll('[data-testid="doctor-panel-visit"]');
    expect(visits[0].text()).toContain("Ana Ruiz");
    expect(visits[0].text()).toContain("Patient confirmed");
    expect(visits[1].text()).toContain("Luis Paz");
    expect(visits[1].text()).toContain("Not confirmed yet");
    expect(w.find('[data-testid="doctor-panel-today"]').text()).not.toContain("Eva Gil");
    expect(w.findAll('[data-testid="doctor-panel-day"]').map((d) => d.text())).toEqual(["Today", "Tomorrow"]);
    expect(w.find('[data-testid="doctor-panel-today-count"]').text()).toBe("2");
  });

  it("Needs your action lists one row per item, each linking to its patient", async () => {
    serve(ACTIONS);
    const w = mountTiles();
    await vi.waitFor(() => expect(w.findAll('[data-testid="doctor-panel-action"]')).toHaveLength(4));
    const rows = w.findAll('[data-testid="doctor-panel-action"]');
    expect(rows.map((r) => r.attributes("href"))).toEqual(["/patients/p1", "/patients/p4", "/patients/p5", "/patients/p6"]);
    expect(rows[0].text()).toContain("Results to interpret");
    expect(rows[1].text()).toContain("Can't come");
    expect(rows[2].text()).toContain("Plan not shared with the patient");
    expect(rows[3].text()).toContain("Consent not signed");
    expect(w.find('[data-testid="doctor-panel-actions-count"]').text()).toBe("4");
    expect(w.findAll('[data-testid="doctor-panel-visit"]')[0].attributes("href")).toBe("/patients/p1");
  });

  it("long queue: shows the first 5, Show all reveals the rest", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ kind: "consent_missing", patient_id: `c${i}`, patient_name: `P ${i}`, ref_id: "informedConsent", at: null }));
    serve({ enabled: true, items: many });
    const w = mountTiles();
    await vi.waitFor(() => expect(w.findAll('[data-testid="doctor-panel-action"]')).toHaveLength(5));
    expect(w.find('[data-testid="doctor-panel-actions-count"]').text()).toBe("8");
    await w.find('[data-testid="doctor-panel-actions-more"]').trigger("click");
    expect(w.findAll('[data-testid="doctor-panel-action"]')).toHaveLength(8);
  });

  it("empty tiles stay on screen with a calm empty state", async () => {
    serve({ enabled: true, items: [] }, { items: [] });
    const w = mountTiles();
    await vi.waitFor(() => expect(w.find('[data-testid="doctor-panel-actions-empty"]').exists()).toBe(true));
    expect(w.find('[data-testid="doctor-panel-actions-empty"]').text()).toBe("Nothing is waiting on you");
    expect(w.find('[data-testid="doctor-panel-today-empty"]').text()).toBe("No visits today or tomorrow");
  });
});
