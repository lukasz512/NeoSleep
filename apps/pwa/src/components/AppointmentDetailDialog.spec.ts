import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import { useAuthStore } from "../stores/auth";
import type { Appointment } from "../composables/useAppointments";
import AppointmentDetailDialog from "./AppointmentDetailDialog.vue";

/** NEO-254 (decision form D1, 2026-10-06): the guided follow-up after the patient says "I can't come". */
const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

const BASE: Appointment = {
  id: "a-1",
  patient_id: "p-1",
  patient_name: "Ana López",
  patient_first_name: "Ana",
  patient_last_name: "López",
  patient_phone: null,
  practitioner_id: "doc-1",
  practitioner_name: "Dra. Ruiz",
  practitioner_first_name: "Rosa",
  practitioner_last_name: "Ruiz",
  organization_id: null,
  organization_name: null,
  sleep_study_id: null,
  treatment_plan_id: null,
  created_by_user_id: "u-1",
  type: "visit",
  status: "scheduled",
  start_at: "2031-09-10T16:00:00.000Z",
  end_at: "2031-09-10T17:00:00.000Z",
  timezone: "America/Mexico_City",
  location_type: "clinic",
  notes: null,
  patient_response: null,
  patient_responded_at: null,
  patient_response_note: null,
};
const DECLINED: Appointment = { ...BASE, patient_response: "cannot_attend", patient_responded_at: new Date(Date.now() - 2 * 3_600_000).toISOString() };

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  document.body.innerHTML = "";
});

async function open(appointment: Appointment, role = "doctor") {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(AppointmentDetailDialog, {
    props: { modelValue: true, appointment },
    global: { plugins: [i18n, vuetify], stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("AppointmentDetailDialog — patient can't attend (NEO-254)", () => {
  it("an ordinary scheduled visit keeps complete, no-show, reschedule and cancel; no follow-up", async () => {
    await open(BASE);
    for (const id of ["appointment-complete", "appointment-no-show", "appointment-reschedule", "appointment-cancel"]) expect(byTestId(id), id).not.toBeNull();
    expect(byTestId("appointment-followup")).toBeNull();
    expect(byTestId("appointment-keep")).toBeNull();
  });

  it("cannot_attend hides complete and no-show and offers Nueva fecha / Sí vendrá / Cancelar", async () => {
    await open(DECLINED);
    expect(byTestId("appointment-complete")).toBeNull();
    expect(byTestId("appointment-no-show")).toBeNull();
    expect(byTestId("appointment-followup")?.textContent).toContain(en["user.appointments.followup.title"]);
    for (const id of ["appointment-reschedule", "appointment-keep", "appointment-cancel"]) expect(byTestId(id), id).not.toBeNull();
  });

  it("no phone hides the contact pills", async () => {
    await open(DECLINED);
    expect(byTestId("appointment-call")).toBeNull();
    expect(byTestId("appointment-whatsapp")).toBeNull();
  });

  it("with a phone: call and WhatsApp links to that number", async () => {
    await open({ ...DECLINED, patient_phone: "+52 55 1234-5678" });
    expect(byTestId("appointment-call")?.getAttribute("href")).toBe("tel:+525512345678");
    expect(byTestId("appointment-call")?.textContent).toContain("+52 55 1234-5678");
    expect(byTestId("appointment-whatsapp")?.getAttribute("href")).toBe("https://wa.me/525512345678");
  });

  it("shows the day the patient suggested", async () => {
    await open({ ...DECLINED, patient_response_note: "Jueves por la tarde" });
    expect(byTestId("appointment-patient-suggestion")?.textContent).toContain("Jueves por la tarde");
  });

  it("'Sí vendrá' records the visit as confirmed", async () => {
    const wrapper = await open(DECLINED);
    const confirmed = { ...DECLINED, patient_response: "confirmed" };
    apiFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => confirmed } as Response);
    byTestId("appointment-keep")!.click();
    await flushPromises();
    const [path, init] = apiFetch.mock.calls.at(-1)! as [string, { method: string; body: string }];
    expect([path, init.method, JSON.parse(init.body)]).toEqual(["/api/v1/appointments/a-1", "PATCH", { patient_response: "confirmed" }]);
    expect(wrapper.emitted("changed")?.[0]).toEqual([confirmed]);
  });
});
