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
import "../components/EventForm.vue";
import "../components/AppointmentDialog.vue";
import "../components/AppointmentDetailDialog.vue";
import CalendarView from "./CalendarView.vue";

/**
 * CORE-117: CalendarView merges the old PlannerView (encounters) and
 * AppointmentsView (appointments) into one "Calendario" screen, reading one
 * union list from /api/v1/calendar. These tests replace the deleted
 * PlannerView.spec.ts / AppointmentsView.spec.ts.
 */

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

async function mountView(role: string, path = "/calendar") {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(CalendarView, { global: { plugins: [i18n, vuetify, router] } });
  wrappers.push(wrapper);
  await flushPromises();
  return Object.assign(wrapper, { router });
}

describe("CalendarView (CORE-117)", () => {
  it("loads the visible window from /api/v1/calendar — a doctor starts on today's day agenda", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await mountView("doctor");
    const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
    expect(url.pathname).toBe("/api/v1/calendar");
    const hours = (new Date(url.searchParams.get("end")!).getTime() - new Date(url.searchParams.get("start")!).getTime()) / 3_600_000;
    expect(hours).toBeGreaterThanOrEqual(23);
    expect(hours).toBeLessThanOrEqual(25);
  });

  it("other staff start on the week", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await mountView("manager");
    const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
    const days = (new Date(url.searchParams.get("end")!).getTime() - new Date(url.searchParams.get("start")!).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it("the week window starts on Monday (NEO-104 fix, kept for the merged calendar)", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await mountView("manager");
    const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
    const monday = new Date(url.searchParams.get("start")!);
    expect(monday.getDay()).toBe(1);
  });

  it("is in every staff role's menu, right after Patients, as one 'calendar' entry", () => {
    for (const role of ["doctor", "manager", "rep", "kam", "msl", "admin"] as const) {
      const names = navRoutesForRole(role).map((r) => r.name);
      expect(names).toContain("calendar");
      expect(names.indexOf("calendar")).toBe(names.indexOf("patients") + 1);
      // Planificador and Citas are gone as separate nav entries.
      expect(names).not.toContain("planner");
      expect(names).not.toContain("appointments");
    }
  });

  it("switching to the day view re-fetches a ~24h window", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    const wrapper = await mountView("manager");
    apiFetch.mockClear();

    await wrapper.find('[data-testid="calendar-view-day"]').trigger("click");
    await flushPromises();

    expect(apiFetch).toHaveBeenCalled();
    const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
    const hours = (new Date(url.searchParams.get("end")!).getTime() - new Date(url.searchParams.get("start")!).getTime()) / 3_600_000;
    expect(hours).toBeGreaterThanOrEqual(23);
    expect(hours).toBeLessThanOrEqual(25);
  });

  const TWO_KINDS = {
    items: [
      { kind: "encounter", id: "e-1", start_at: "2032-01-01T10:00:00.000Z", end_at: "2032-01-01T11:00:00.000Z", data: { id: "e-1", start_at: "2032-01-01T10:00:00.000Z", end_at: "2032-01-01T11:00:00.000Z", type: "visit", status: "scheduled", metadata: { title: "HCO visit" } } },
      { kind: "appointment", id: "a-1", start_at: "2032-01-01T14:00:00.000Z", end_at: "2032-01-01T14:30:00.000Z", data: { id: "a-1", patient_id: "p-1", patient_name: "Jane Doe", practitioner_id: "doc-1", practitioner_name: "Dr. Smith", start_at: "2032-01-01T14:00:00.000Z", end_at: "2032-01-01T14:30:00.000Z", timezone: "UTC", status: "scheduled" } },
    ],
  };

  it("CORE-122: the month view asks for 6 full weeks from a Monday and draws both kinds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2032, 0, 1, 9, 0));
    try {
      apiFetch.mockResolvedValue(jsonResponse(true, 200, TWO_KINDS));
      const wrapper = await mountView("manager");
      apiFetch.mockClear();

      await wrapper.find('[data-testid="calendar-view-month"]').trigger("click");
      await flushPromises();

      const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
      const start = new Date(url.searchParams.get("start")!);
      const days = (new Date(url.searchParams.get("end")!).getTime() - start.getTime()) / 86_400_000;
      expect(start.getDay()).toBe(1);
      expect(Math.round(days)).toBe(42);
      expect(wrapper.find('[data-testid="calendar-month"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="calendar-grid"]').exists()).toBe(false);
      expect(wrapper.findAll('[data-testid="calendar-event"]')).toHaveLength(2);
      expect(wrapper.text()).toContain("HCO visit");
      expect(wrapper.text()).toContain("Jane Doe");
    } finally {
      vi.useRealTimers();
    }
  });

  it("CORE-122: the week grid draws both kinds, and a date in the month opens that day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2032, 0, 1, 9, 0));
    try {
      apiFetch.mockResolvedValue(jsonResponse(true, 200, TWO_KINDS));
      const wrapper = await mountView("manager");
      expect(wrapper.find('[data-testid="calendar-grid"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-testid="calendar-event"]')).toHaveLength(2);

      await wrapper.find('[data-testid="calendar-view-month"]').trigger("click");
      await flushPromises();
      apiFetch.mockClear();
      const fifth = wrapper.findAll('[data-testid="calendar-day-link"]').find((b) => b.text() === "5");
      await fifth!.trigger("click");
      await flushPromises();

      expect(wrapper.find('[data-testid="calendar-view-day"]').attributes("aria-selected")).toBe("true");
      const url = new URL(String(apiFetch.mock.calls[0]![0]), "http://x");
      expect(new Date(url.searchParams.get("start")!).getDate()).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("CORE-129: a swipe on the month goes to the next / previous month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2032, 0, 14, 9, 0));
    try {
      apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
      const wrapper = await mountView("manager");
      await wrapper.find('[data-testid="calendar-view-month"]').trigger("click");
      await flushPromises();
      const startOf = () => new Date(new URL(String(apiFetch.mock.calls.at(-1)![0]), "http://x").searchParams.get("start")!);
      const body = wrapper.find(".cal__body");

      apiFetch.mockClear();
      await body.trigger("pointerdown", { pointerType: "touch", clientX: 300, clientY: 400 });
      await body.trigger("pointerup", { pointerType: "touch", clientX: 120, clientY: 410 });
      await flushPromises();
      // February 2032's grid starts on Monday 26 January.
      expect(startOf().getMonth()).toBe(0);
      expect(startOf().getDate()).toBe(26);

      apiFetch.mockClear();
      await body.trigger("pointerdown", { pointerType: "touch", clientX: 100, clientY: 400 });
      await body.trigger("pointerup", { pointerType: "touch", clientX: 300, clientY: 395 });
      await flushPromises();
      // Back to January 2032: its grid starts on Monday 29 December 2031.
      expect(startOf().getFullYear()).toBe(2031);
      expect(startOf().getDate()).toBe(29);
    } finally {
      vi.useRealTimers();
    }
  });

  it("CORE-129: a mostly vertical drag is a scroll, not a swipe", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    const wrapper = await mountView("manager");
    await wrapper.find('[data-testid="calendar-view-month"]').trigger("click");
    await flushPromises();
    apiFetch.mockClear();
    const body = wrapper.find(".cal__body");
    await body.trigger("pointerdown", { pointerType: "touch", clientX: 300, clientY: 400 });
    await body.trigger("pointerup", { pointerType: "touch", clientX: 230, clientY: 200 });
    await flushPromises();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("CORE-129: Calendario draws its own header on phones (route meta)", () => {
    const calendar = routes.find((r) => r.name === "calendar");
    expect(calendar?.meta?.phoneOwnHeader).toBe(true);
  });

  it("CORE-122: prev/next pages by the view's period", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    const wrapper = await mountView("manager");
    const firstStart = new Date(new URL(String(apiFetch.mock.calls[0]![0]), "http://x").searchParams.get("start")!);
    apiFetch.mockClear();

    await wrapper.find('[data-testid="calendar-next"]').trigger("click");
    await flushPromises();

    const nextStart = new Date(new URL(String(apiFetch.mock.calls[0]![0]), "http://x").searchParams.get("start")!);
    expect(Math.round((nextStart.getTime() - firstStart.getTime()) / 86_400_000)).toBe(7);
  });

  it("CORE-122: unticking a calendar hides its entries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2032, 0, 1, 9, 0));
    try {
      apiFetch.mockResolvedValue(jsonResponse(true, 200, TWO_KINDS));
      const wrapper = await mountView("manager");
      await wrapper.find('[data-testid="calendar-filter-encounter"]').setValue(false);
      expect(wrapper.findAll('[data-testid="calendar-event"]')).toHaveLength(1);
      expect(wrapper.text()).not.toContain("HCO visit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the \"+\" button offers a choice between Appointment and Event (CORE-117)", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    const wrapper = await mountView("manager");

    await wrapper.find('[data-testid="calendar-add"]').trigger("click");
    await flushPromises();

    expect(document.body.querySelector('[data-testid="calendar-add-appointment"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="calendar-add-event"]')).not.toBeNull();
  });

  // CORE-4: a notification about a visit opens that visit, not just the calendar.
  it("?appointment=<id> loads that visit, jumps to its day and opens its detail", async () => {
    const appointment = { id: "a-9", patient_id: "p-1", patient_name: "Jane Doe", practitioner_id: "doc-1", practitioner_name: "Dr. Smith", start_at: "2032-03-10T14:00:00.000Z", end_at: "2032-03-10T14:30:00.000Z", timezone: "UTC", status: "scheduled" };
    apiFetch.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/v1/appointments/a-9") ? jsonResponse(true, 200, appointment) : jsonResponse(true, 200, { items: [] }),
    );
    const wrapper = await mountView("manager", "/calendar?appointment=a-9");
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/appointments/a-9", expect.anything());
    expect(document.body.querySelector('[data-testid="appointment-status"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Jane Doe");
    const lastCalendar = apiFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/v1/calendar")).pop()!;
    const start = new URL(lastCalendar, "http://x").searchParams.get("start")!;
    expect(new Date(start).getTime()).toBeLessThanOrEqual(Date.parse(appointment.start_at));
    expect(Date.parse(appointment.start_at) - new Date(start).getTime()).toBeLessThan(8 * 86_400_000);
    expect(wrapper.router.currentRoute.value.query.appointment).toBeUndefined();
  });

  it("?appointment=<id> that can't be loaded leaves the calendar as it is", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/v1/appointments/") ? jsonResponse(false, 404, {}) : jsonResponse(true, 200, { items: [] }),
    );
    const wrapper = await mountView("manager", "/calendar?appointment=gone");
    await flushPromises();
    expect(document.body.querySelector('[data-testid="appointment-status"]')).toBeNull();
    expect(wrapper.router.currentRoute.value.query.appointment).toBeUndefined();
  });
});
