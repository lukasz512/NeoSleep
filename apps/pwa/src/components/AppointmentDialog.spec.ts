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

async function open(role: string, extraProps: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(AppointmentDialog, {
    props: { modelValue: true, patient: PATIENT, startAt: "2031-09-10T16:00:00.000Z", ...extraProps },
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
    // No clinic zone from the API here → the device zone bridges; the wall time is sent as shown (CORE-120).
    expect(lastPostBody().start_local).toMatch(/^2031-09-1\dT\d{2}:00$/);
    expect(wrapper.emitted("saved")?.[0]).toEqual([SAVED]);
    expect(notify).toHaveBeenCalledWith("Appointment booked", "success", undefined, expect.objectContaining({ icon: "nav-appointments" }));
  });

  it("books in the clinic's wall-clock time: shows and sends 10:00 for an MX clinic, whatever the device zone (CORE-120)", async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith("/api/v1/appointments/booking-zone")
        ? jsonResponse(true, 200, { timezone: "America/Mexico_City" })
        : jsonResponse(true, 200, { items: [{ id: "doc-1", name: "Dra. Ruiz" }] }),
    );
    await open("admin");
    const zoneCall = apiFetch.mock.calls.find(([p]) => String(p).startsWith("/api/v1/appointments/booking-zone"));
    expect(zoneCall?.[0]).toBe("/api/v1/appointments/booking-zone?practitioner_id=doc-1");
    // 16:00Z is 10:00 in Mexico City (UTC−6, no DST since 2022).
    const shown = [...(byTestId("appointment-start")?.querySelectorAll("input") ?? [])].map((i) => i.value).join(" ");
    expect(shown).toContain("10:00");

    apiFetch.mockImplementationOnce(async () => jsonResponse(true, 201, SAVED));
    byTestId("appointment-submit")!.click();
    await flushPromises();
    const body = lastPostBody();
    expect(body.start_local).toBe("2031-09-10T10:00");
    expect(body).not.toHaveProperty("start_at");
  });

  it("a clicked calendar slot is wall time: 15:00 stays 15:00 when the clinic zone arrives (CORE-120)", async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith("/api/v1/appointments/booking-zone")
        ? jsonResponse(true, 200, { timezone: "America/Mexico_City" })
        : jsonResponse(true, 200, { items: [] }),
    );
    await open("admin", { startAt: null, startLocal: "2031-09-10T15:00" });
    apiFetch.mockImplementationOnce(async () => jsonResponse(true, 201, SAVED));
    byTestId("appointment-submit")!.click();
    await flushPromises();
    expect(lastPostBody().start_local).toBe("2031-09-10T15:00");
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

  it("a 400 naming a field marks that field and the summary — no toast, no problem box (NEO-109)", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    const wrapper = await open("admin");
    const body = { error: "An appointment must last between 15 and 480 minutes", code: "VALIDATION_ERROR", field: "duration_minutes", reason: "invalid" };
    apiFetch.mockResolvedValueOnce({ ...jsonResponse(false, 400, body), clone: () => jsonResponse(false, 400, body) } as Response);
    byTestId("appointment-submit")!.click();
    await flushPromises();

    const summary = byTestId("form-error-summary");
    expect(summary?.textContent).toContain("Fields to fix: 1");
    expect(summary?.textContent).toContain("Length — Check this field");
    expect(byTestId("appointment-problem")).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    // Editing the rejected field clears its error (and the summary with it).
    wrapper.findComponent(vuetifyComponents.VSelect).vm.$emit("update:modelValue", 30);
    await flushPromises();
    expect(byTestId("form-error-summary")).toBeNull();
  });

  it("a 400 naming a field the dialog doesn't show falls back to the problem box", async () => {
    apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
    await open("admin");
    const body = { error: "sleep_study_id does not belong to this patient", code: "VALIDATION_ERROR", field: "sleep_study_id", reason: "invalid" };
    apiFetch.mockResolvedValueOnce({ ...jsonResponse(false, 400, body), clone: () => jsonResponse(false, 400, body) } as Response);
    byTestId("appointment-submit")!.click();
    await flushPromises();

    expect(byTestId("form-error-summary")).toBeNull();
    expect(byTestId("appointment-problem")).not.toBeNull();
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

describe("AppointmentDialog — doctor outside the care team (CORE-132 D4)", () => {
  const routeApi = (team: { practitioner_id: string }[]) =>
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/v1/patient/p-1/care-team") return jsonResponse(true, 200, team);
      return jsonResponse(true, 200, { items: [] });
    });
  const posts = () => apiFetch.mock.calls.filter(([p, init]) => p === "/api/v1/appointments" && (init as { method?: string })?.method === "POST");

  it("asks to confirm access and won't book until it's ticked; then sends grant_access", async () => {
    routeApi([{ practitioner_id: "doc-1" }]);
    await open("admin", { practitioner: { id: "doc-2", name: "Dr. Pérez" } });
    expect(byTestId("appointment-grant")!.textContent).toContain("Dr. Pérez is not on this patient's care team yet");

    byTestId("appointment-submit")!.click();
    await flushPromises();
    expect(posts()).toHaveLength(0);

    byTestId("appointment-grant-checkbox")!.querySelector("input")!.click();
    await flushPromises();
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { ...SAVED, practitioner_id: "doc-2" }));
    byTestId("appointment-submit")!.click();
    await flushPromises();
    expect(posts()).toHaveLength(1);
    expect(lastPostBody()).toMatchObject({ practitioner_id: "doc-2", grant_access: true });
  });

  it("a doctor already on the team needs no confirmation and sends no grant_access", async () => {
    routeApi([{ practitioner_id: "doc-1" }, { practitioner_id: "doc-2" }]);
    await open("admin", { practitioner: { id: "doc-2", name: "Dr. Pérez" } });
    expect(byTestId("appointment-grant")).toBeNull();

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, SAVED));
    byTestId("appointment-submit")!.click();
    await flushPromises();
    expect(lastPostBody().grant_access).toBeUndefined();
  });

  it("a doctor booking themself is never asked", async () => {
    routeApi([]);
    await open("doctor");
    expect(byTestId("appointment-grant")).toBeNull();
    expect(apiFetch.mock.calls.some(([p]) => String(p).endsWith("/care-team"))).toBe(false);
  });
});
