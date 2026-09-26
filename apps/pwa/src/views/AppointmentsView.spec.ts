import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import { routes, navRoutesForRole } from "../router/routes";
import { useAuthStore } from "../stores/auth";
import "../components/AppointmentDialog.vue";
import "../components/AppointmentDetailDialog.vue";
import AppointmentsView from "./AppointmentsView.vue";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountView(role: string) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/appointments");
  await router.isReady();
  const wrapper = mount(AppointmentsView, { global: { plugins: [i18n, vuetify, router] } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("AppointmentsView (NEO-34)", () => {
  it("loads the visible window from /api/v1/appointments — a doctor starts on today's day agenda", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await mountView("doctor");
    const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
    expect(url.pathname).toBe("/api/v1/appointments");
    const hours = (new Date(url.searchParams.get("end")!).getTime() - new Date(url.searchParams.get("start")!).getTime()) / 3_600_000;
    expect(hours).toBeGreaterThanOrEqual(23);
    expect(hours).toBeLessThanOrEqual(25);
  });

  it("staff start on the week", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await mountView("manager");
    const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
    const days = (new Date(url.searchParams.get("end")!).getTime() - new Date(url.searchParams.get("start")!).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it("is in every staff role's menu, right after Patients", () => {
    for (const role of ["doctor", "manager", "rep", "kam", "msl", "admin"] as const) {
      const names = navRoutesForRole(role).map((r) => r.name);
      expect(names).toContain("appointments");
      expect(names.indexOf("appointments")).toBe(names.indexOf("patients") + 1);
    }
  });
});
