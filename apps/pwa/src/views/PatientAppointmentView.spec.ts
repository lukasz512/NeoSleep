import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) =>
    args[0] === "/api/v1/config/app" ? Promise.resolve({ ok: false, status: 404, json: async () => ({}) }) : apiFetch(...args),
}));

import PatientAppointmentView from "./PatientAppointmentView.vue";

/**
 * CORE-25: the patient's page behind the appointment email's buttons.
 * Nothing is answered on load (mail scanners open links); the patient taps.
 */
const TOKEN = "b".repeat(43);

const appointment = (over: Record<string, unknown> = {}) => ({
  status: "scheduled",
  past: false,
  start_at: "2031-01-15T15:00:00.000Z",
  end_at: "2031-01-15T16:00:00.000Z",
  timezone: "America/Mexico_City",
  clinic_name: "Clínica Sonrisa",
  clinic_address: "Av. Reforma 1, 06600 CDMX",
  doctor_name: "Dra. Ana López",
  online_url: null,
  contact_phone: "+52 55 1234 5678",
  contact_email: "hola@sonrisa.mx",
  patient_response: null,
  opted_out: false,
  locale: "mx",
  calendar: { ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", google: "https://calendar.google.com/x", outlook: "https://outlook.live.com/x" },
  ...over,
});

function json(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountView(query = ""): Promise<VueWrapper> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/a", component: PatientAppointmentView }] });
  await router.push(`/a${query}#${TOKEN}`);
  await router.isReady();
  const wrapper = mount(PatientAppointmentView, { global: { plugins: [i18n, vuetify, router] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function lastBody(): Record<string, unknown> {
  const call = apiFetch.mock.calls.at(-1)!;
  return JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
}

describe("PatientAppointmentView (CORE-25)", () => {
  it("shows the clinic-local time, clinic, doctor and how to reach the clinic; answers nothing on its own", async () => {
    apiFetch.mockResolvedValueOnce(json(200, appointment()));
    const wrapper = await mountView("?r=confirm");
    const details = wrapper.find("[data-testid='appointment-details']").text();
    expect(details).toContain("09:00"); // 15:00 UTC in Mexico City
    expect(details).toContain("Clínica Sonrisa");
    expect(details).toContain("Dra. Ana López");
    expect(wrapper.find("a[href='tel:+525512345678']").exists()).toBe(true);
    expect(wrapper.find("a[href='mailto:hola@sonrisa.mx']").exists()).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0]![0]).toBe("/api/v1/public/appointment/lookup");
    expect(lastBody()).toEqual({ token: TOKEN });
  });

  it("'Yes' posts the answer, thanks the patient, then offers step 2: add to calendar (CORE-116)", async () => {
    apiFetch.mockResolvedValueOnce(json(200, appointment()));
    const wrapper = await mountView();
    apiFetch.mockResolvedValueOnce(json(200, appointment({ patient_response: "confirmed" })));
    await wrapper.find("[data-testid='appointment-confirm']").trigger("click");
    await flushPromises();
    expect(apiFetch.mock.calls.at(-1)![0]).toBe("/api/v1/public/appointment/respond");
    expect(lastBody()).toEqual({ token: TOKEN, response: "confirmed" });
    expect(wrapper.find("[data-testid='appointment-thanks']").text()).toContain(en["publicAppointment.thanksTitle"]);
    const calendar = wrapper.find("[data-testid='appointment-calendar']");
    expect(calendar.text()).toContain(en["publicAppointment.calendarTitle"]);
    // jsdom's user agent is a desktop one → Google first, Outlook and the .ics file below.
    expect(calendar.find("[data-testid='calendar-primary']").attributes("href")).toBe("https://calendar.google.com/x");
    expect(calendar.find("a[href='https://outlook.live.com/x']").exists()).toBe(true);
    expect(calendar.text()).toContain(en["publicAppointment.calendarFile"]);
  });

  it("the question is two big coloured buttons: yes (green) and no", async () => {
    apiFetch.mockResolvedValueOnce(json(200, appointment()));
    const wrapper = await mountView("?r=confirm");
    expect(wrapper.find("[data-testid='appointment-confirm']").text()).toContain(en["publicAppointment.yes"]);
    expect(wrapper.find("[data-testid='appointment-confirm']").classes()).toContain("patient-appointment__choice--yes");
    expect(wrapper.find("[data-testid='appointment-cannot']").text()).toContain(en["publicAppointment.no"]);
  });

  it("'No' thanks the patient and puts the clinic's phone and email up front, without a calendar step", async () => {
    apiFetch.mockResolvedValueOnce(json(200, appointment()));
    const wrapper = await mountView("?r=cannot");
    apiFetch.mockResolvedValueOnce(json(200, appointment({ patient_response: "cannot_attend" })));
    await wrapper.find("[data-testid='appointment-cannot']").trigger("click");
    await flushPromises();
    expect(lastBody()).toEqual({ token: TOKEN, response: "cannot_attend" });
    const answer = wrapper.find("[data-testid='appointment-answer']");
    expect(answer.text()).toContain(en["publicAppointment.cannotTitle"]);
    expect(answer.find("a[href='tel:+525512345678']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='appointment-calendar']").exists()).toBe(false);
  });

  it("a cancelled appointment shows no buttons", async () => {
    apiFetch.mockResolvedValueOnce(json(200, appointment({ status: "cancelled" })));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain(en["publicAppointment.cancelled"]);
    expect(wrapper.find("[data-testid='appointment-confirm']").exists()).toBe(false);
  });

  it("the stop link opens the unsubscribe confirmation; confirming posts opt-out", async () => {
    apiFetch.mockResolvedValueOnce(json(200, appointment()));
    const wrapper = await mountView("?r=stop");
    apiFetch.mockResolvedValueOnce(json(200, appointment({ opted_out: true })));
    await wrapper.find("[data-testid='appointment-opt-out']").trigger("click");
    await flushPromises();
    expect(apiFetch.mock.calls.at(-1)![0]).toBe("/api/v1/public/appointment/opt-out");
    expect(wrapper.find("[data-testid='appointment-opted-out']").exists()).toBe(true);
  });

  it("a dead link says so", async () => {
    apiFetch.mockResolvedValueOnce(json(410, { code: "LINK_INVALID" }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain(en["publicAppointment.invalid"]);
  });
});
