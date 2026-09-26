import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import { useAuthStore } from "../stores/auth";
import AppointmentDialog from "./AppointmentDialog.vue";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const PATIENT = { id: "p-1", name: "Ana López", practitioner_id: "doc-1" };
const SAVED = {
  id: "a-1",
  patient_id: "p-1",
  patient_name: "Ana López",
  practitioner_id: "doc-1",
  practitioner_name: "Dra. Ruiz",
  status: "scheduled",
  start_at: "2031-09-10T16:00:00.000Z",
  end_at: "2031-09-10T17:00:00.000Z",
  timezone: "America/Mexico_City",
  notes: null,
};

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
  document.body.innerHTML = "";
});

async function open(role: string) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(AppointmentDialog, {
    props: { modelValue: true, patient: PATIENT, startAt: "2031-09-10T16:00:00.000Z" },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const lastPostBody = () => JSON.parse((apiFetch.mock.calls.at(-1)![1] as { body: string }).body);

describe("AppointmentDialog (NEO-34)", () => {
  it("books the patient with their assigned doctor, 60 minutes by default", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [{ id: "doc-1", name: "Dra. Ruiz" }] }));
    const wrapper = await open("admin");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, SAVED));
    byTestId("appointment-submit")!.click();
    await flushPromises();

    const [path, init] = apiFetch.mock.calls.at(-1)! as [string, { method: string }];
    expect([path, init.method]).toEqual(["/api/v1/appointments", "POST"]);
    expect(lastPostBody()).toMatchObject({ patient_id: "p-1", practitioner_id: "doc-1", duration_minutes: 60 });
    expect(new Date(lastPostBody().start_at).toISOString()).toBe("2031-09-10T16:00:00.000Z");
    expect(wrapper.emitted("saved")?.[0]).toEqual([SAVED]);
    expect(notify).toHaveBeenCalledWith("Appointment booked", "success", undefined, expect.objectContaining({ icon: "nav-appointments" }));
  });

  it("keeps the dialog open and says the slot is taken on 409", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    const wrapper = await open("admin");
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 409, { error: "taken" }));
    byTestId("appointment-submit")!.click();
    await flushPromises();

    expect(byTestId("appointment-problem")?.textContent).toContain("already has an appointment at this time");
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("a rep books without a notes field (no health data for the field force)", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await open("rep");
    expect(document.body.textContent).not.toContain("Notes");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, SAVED));
    byTestId("appointment-submit")!.click();
    await flushPromises();
    expect(lastPostBody()).not.toHaveProperty("notes");
  });

  it("a doctor never picks a doctor — the API books with themselves", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await open("doctor");
    expect(byTestId("appointment-doctor")).toBeNull();
    expect(apiFetch.mock.calls.some(([p]) => String(p).startsWith("/api/v1/practitioner"))).toBe(false);
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, SAVED));
    byTestId("appointment-submit")!.click();
    await flushPromises();
    expect(lastPostBody().practitioner_id).toBeUndefined();
  });
});
