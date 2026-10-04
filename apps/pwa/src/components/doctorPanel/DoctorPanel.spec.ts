import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import DoctorPanel from "./DoctorPanel.vue";
import { useAuthStore } from "../../stores/auth";

/** NEO-233 / NEO-238: the doctor's own Panel — counting indicators, ring top right, short glass lists. */

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const NOW = new Date("2026-10-05T08:00:00");
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).toISOString();

const APPOINTMENTS = {
  items: [
    { id: "a1", patient_id: "p1", patient_name: "Ana Ruiz", organization_name: "Clínica Norte", status: "scheduled", start_at: at(5, 10), end_at: at(5, 11), patient_response: "confirmed", confirm_request_sent_at: at(3, 9) },
    { id: "a4", patient_id: "p7", patient_name: "Iris Mar", organization_name: null, status: "scheduled", start_at: at(5, 16), end_at: at(5, 17), patient_response: null, confirm_request_sent_at: at(4, 9) },
    { id: "a2", patient_id: "p2", patient_name: "Luis Paz", organization_name: null, status: "scheduled", start_at: at(6, 9), end_at: at(6, 10), patient_response: null, confirm_request_sent_at: at(4, 9) },
    { id: "a3", patient_id: "p3", patient_name: "Eva Gil", organization_name: null, status: "cancelled", start_at: at(5, 12), end_at: at(5, 13), patient_response: null, confirm_request_sent_at: null },
  ],
};

const result = (n: number, day: number) => ({ kind: "results_to_interpret", patient_id: `r${n}`, patient_name: `Result ${n}`, ref_id: `s${n}`, at: at(day, 9) });
const ACTIONS = {
  enabled: true,
  items: [
    result(1, 1), result(2, 3), result(3, 4), result(4, 4), result(5, 4),
    { kind: "cannot_attend", patient_id: "p4", patient_name: "Raúl Sol", ref_id: "a9", at: at(7, 9) },
    { kind: "consent_missing", patient_id: "p6", patient_name: "Leo Ríos", ref_id: "informedConsent", at: null },
  ],
};

const SUMMARY = {
  enabled: true,
  stages: { intake: 2, study: 1, results: 0, plan: 3, treatment: 4 },
  incomplete: [
    { patient_id: "p6", patient_name: "Leo Ríos", missing: ["informedConsent", "phone"], done: 4, total: 6 },
    { patient_id: "p8", patient_name: "Zoe Luna", missing: ["email"], done: 5, total: 6 },
  ],
};

function serve() {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/v1/doctor-panel/actions")) return jsonResponse(ACTIONS);
    if (path.startsWith("/api/v1/doctor-panel/summary")) return jsonResponse(SUMMARY);
    if (path.startsWith("/api/v1/appointments")) return jsonResponse(APPOINTMENTS);
    if (path.startsWith("/api/v1/patient?")) return jsonResponse({ items: [{ id: "p1", name: "Ana Ruiz" }] });
    throw new Error(`unexpected ${path}`);
  });
}

const mounted: VueWrapper[] = [];
let router: Router;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "requestAnimationFrame"] });
  vi.setSystemTime(NOW);
  serve();
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
  vi.useRealTimers();
});

async function mountPanel(): Promise<VueWrapper> {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u1", email: "doc@example.invalid", name: "Dra. Ramírez", role: "doctor" };
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/dashboard", name: "dashboard", component: DoctorPanel },
      { path: "/patients", name: "patients", component: { template: "<div/>" } },
      { path: "/patients/:id", name: "patient-detail", component: { template: "<div/>" } },
      { path: "/calendar", name: "calendar", component: { template: "<div/>" } },
      { path: "/treatment-plans", name: "treatment-plans", component: { template: "<div/>" } },
    ],
  });
  await router.push("/dashboard");
  await router.isReady();
  const wrapper = mount({ template: "<RouterView />" }, { global: { plugins: [i18n, vuetify, router] }, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const kpi = (w: VueWrapper, id: string) => w.get(`[data-testid="doctor-panel-kpi-${id}"]`).text();

/** Lets the entrance play out: two frames to start it, then the 0.9 s count-up. */
async function settle(): Promise<void> {
  vi.advanceTimersToNextFrame();
  vi.advanceTimersToNextFrame();
  await flushPromises();
  vi.advanceTimersByTime(1500);
  await flushPromises();
}

describe("DoctorPanel (NEO-233, NEO-238 quick glance)", () => {
  it("greets the doctor and counts the 4 indicators up to their values", async () => {
    const w = await mountPanel();
    expect(w.get('[data-testid="doctor-panel-greeting"]').text()).toBe("Good morning, Dra. Ramírez");
    expect(kpi(w, "interpret")).toContain("0");
    await settle();
    // Today: a1 confirmed + a4 not confirmed; a2 is tomorrow, a3 cancelled.
    expect(kpi(w, "visits")).toContain("2");
    expect(kpi(w, "visits")).toContain("1 not confirmed");
    expect(kpi(w, "interpret")).toContain("5");
    expect(kpi(w, "interpret")).toContain("Oldest: 4 days");
    expect(kpi(w, "incomplete")).toContain("2");
    expect(kpi(w, "treatment")).toContain("4");
    expect(kpi(w, "treatment")).toContain("of 10 active");
  });

  it("shows one row per kind of waiting item: count, oldest patient, +N", async () => {
    const w = await mountPanel();
    const groups = w.findAll('[data-testid="doctor-panel-action-group"]');
    expect(groups).toHaveLength(3);
    expect(groups[0].text()).toContain("Results to interpret");
    expect(groups[0].text()).toContain("Result 1 · +4 more");
    expect(groups[0].get(".dp__badge").text()).toBe("5");
    expect(groups[0].attributes("href")).toBe("/patients/r1");
    expect(w.get('[data-testid="doctor-panel-actions-count"]').text()).toBe("7");
  });

  it("keeps every list to 4 rows", async () => {
    const many = Array.from({ length: 7 }, (_, n) => ({ ...APPOINTMENTS.items[0], id: `v${n}`, start_at: at(5, 9 + n) }));
    const incompleteMany = Array.from({ length: 6 }, (_, n) => ({ patient_id: `i${n}`, patient_name: `I ${n}`, missing: ["email"], done: 5, total: 6 }));
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/doctor-panel/actions")) return jsonResponse(ACTIONS);
      if (path.startsWith("/api/v1/doctor-panel/summary")) return jsonResponse({ ...SUMMARY, incomplete: incompleteMany });
      if (path.startsWith("/api/v1/appointments")) return jsonResponse({ items: many });
      throw new Error(`unexpected ${path}`);
    });
    const w = await mountPanel();
    expect(w.findAll('[data-testid="doctor-panel-visit"]')).toHaveLength(4);
    expect(w.findAll('[data-testid="doctor-panel-incomplete-row"]')).toHaveLength(4);
    await w.get('[data-testid="doctor-panel-incomplete-more"]').trigger("click");
    expect(w.findAll('[data-testid="doctor-panel-incomplete-row"]')).toHaveLength(6);
  });

  it("lists incomplete files with what is missing, phone and email included", async () => {
    const w = await mountPanel();
    const rows = w.findAll('[data-testid="doctor-panel-incomplete-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("Missing: Informed consent, phone");
    expect(rows[1].text()).toContain("Missing: email");
    expect(rows[0].get('[role="meter"]').attributes("aria-valuenow")).toBe("4");
  });

  it("every agenda, action and incomplete row opens its patient", async () => {
    const w = await mountPanel();
    const rows = w.findAll('[data-testid="doctor-panel-visit"], [data-testid="doctor-panel-action-group"], [data-testid="doctor-panel-incomplete-row"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.attributes("href")).toMatch(/^\/patients\/[a-z0-9]+$/);
  });

  it("the stage ring sits in the top block, totals the active patients and draws in after load", async () => {
    const w = await mountPanel();
    expect(w.find('.dp__hero [data-testid="doctor-panel-stages"]').exists()).toBe(true);
    expect(w.findAll('[data-testid="doctor-panel-donut-legend"]')).toHaveLength(5);
    expect(w.findAll('[data-testid="doctor-panel-donut-seg"]')).toHaveLength(4);
    expect(w.get('[data-testid="doctor-panel-donut"]').classes()).not.toContain("dp-donut--drawn");
    expect(w.get('[data-testid="doctor-panel"]').classes()).not.toContain("dp--in");
    await settle();
    expect(w.get('[data-testid="doctor-panel-donut"]').classes()).toContain("dp-donut--drawn");
    expect(w.get('[data-testid="doctor-panel"]').classes()).toContain("dp--in");
    expect(w.get('[data-testid="doctor-panel-donut-total"]').text()).toBe("10");
  });

  it("folds everything away before leaving the page", async () => {
    const w = await mountPanel();
    await settle();
    const leaving = router.push("/patients");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("dashboard");
    expect(w.find('[data-testid="doctor-panel-donut"]').classes()).not.toContain("dp-donut--drawn");
    expect(w.find('[data-testid="doctor-panel"]').classes()).not.toContain("dp--in");
    vi.advanceTimersByTime(400);
    await leaving;
    expect(router.currentRoute.value.name).toBe("patients");
  });

  it("with reduced motion the numbers are final at once and leaving doesn't wait", async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const w = await mountPanel();
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
      await flushPromises();
      expect(kpi(w, "interpret")).toContain("5");
      await router.push("/patients");
      expect(router.currentRoute.value.name).toBe("patients");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("finds a patient from the search box", async () => {
    const w = await mountPanel();
    await w.get('[data-testid="doctor-panel-search"] input').setValue("an");
    vi.advanceTimersByTime(300);
    await flushPromises();
    const hits = w.findAll('[data-testid="doctor-panel-search-hit"]');
    expect(hits).toHaveLength(1);
    expect(hits[0].attributes("href")).toBe("/patients/p1");
    expect(apiFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/patient\?search=an&limit=6$/));
  });
});
