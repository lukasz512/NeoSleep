import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import { setActivePinia, createPinia } from "pinia";
import en from "@i18n/en.json";
import PatientDetailsTab from "./PatientDetailsTab.vue";
import type { PatientDetailsTabPatient, PatientSummary } from "./patientSummary";
import type { CareTeamMember } from "../../composables/usePatientCareTeam";
import { useAuthStore } from "../../stores/auth";
import { CHECKLIST_UPDATED } from "../../composables/usePatientChecklist";
import { emitPatientChanged } from "../../composables/usePatientChanged";
import { routes } from "../../router/routes";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

// CORE-159: the visit dialogs are async and heavy — stand-ins that keep their name and props.
/* eslint-disable vue/one-component-per-file, vue/require-default-prop -- test stand-ins */
vi.mock("../AppointmentDetailDialog.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { __esModule: true, default: defineComponent({ name: "AppointmentDetailDialog", props: { modelValue: Boolean, appointment: Object }, render: () => h("div") }) };
});
vi.mock("../AppointmentDialog.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { __esModule: true, default: defineComponent({ name: "AppointmentDialog", props: { modelValue: Boolean, appointment: Object, patient: Object, practitioner: Object, startAt: String }, render: () => h("div") }) };
});
vi.mock("../EventForm.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { __esModule: true, default: defineComponent({ name: "EventForm", props: { modelValue: Boolean, initialData: Object }, emits: ["submit", "update:modelValue"], render: () => h("div") }) };
});

const PATIENT: PatientDetailsTabPatient = {
  id: "p-1",
  email: "mafer@correo.mx",
  phone: "+52 55 1234 5678",
  status: "active",
  region: "mx",
  ahi_baseline: 18,
  cpap_device: null,
  medical_record: null,
  diagnosis_code: { code: "G47.33", label: "OSA" },
  created_at: "2026-09-02T10:00:00Z",
};

const EMPTY: PatientSummary = {
  preferred_name: null,
  shipping_address: null,
  data_consent_at: null,
  data_consent_withdrawn_at: null,
  latest_study: null,
  device_order: null,
  next_appointment: null,
};

const FULL: PatientSummary = {
  preferred_name: "Mafer",
  shipping_address: { line1: "Masaryk 111", city: "CDMX", postal_code: "11560" },
  data_consent_at: "2026-09-03T10:00:00Z",
  data_consent_withdrawn_at: null,
  latest_study: { id: "s-1", study_date: "2026-09-12", ahi_score: 22.4, spo2_nadir: 84, odi: 19, diagnosis_code: null },
  device_order: { status: "active", metadata: null, order_sync_status: "synced", appliance_delivered_at: null },
  next_appointment: { id: "a-1", start_at: "2026-10-09T10:30:00Z" },
};

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountTab(
  summary: PatientSummary | null,
  opts: { canSeeStudies?: boolean; patient?: Partial<PatientDetailsTabPatient>; careTeam?: CareTeamMember[]; role?: string } = {},
) {
  setActivePinia(createPinia());
  if (opts.role) useAuthStore().user = { id: "u-1", role: opts.role } as NonNullable<ReturnType<typeof useAuthStore>["user"]>;
  apiFetch.mockImplementation(async (path: string) => {
    if (path.endsWith("/care-team")) return { ok: true, status: 200, json: async () => opts.careTeam ?? [] };
    return summary ? { ok: true, status: 200, json: async () => summary } : { ok: false, status: 500, json: async () => ({}) };
  });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div />" } }, { path: "/hcp/:id", name: "hcp-detail", component: { template: "<div />" } }, { path: "/calendar", name: "calendar", component: { template: "<div />" } }] });
  const wrapper = mount(PatientDetailsTab, {
    props: { patient: { ...PATIENT, ...opts.patient }, canSeeStudies: opts.canSeeStudies ?? true },
    global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents }), router] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const tileKeys = (w: VueWrapper) => w.findAll('.patient-details__tiles > [data-testid^="tile-"]').map((t) => t.attributes("data-testid"));
/** The next-visit tile's calendar leaf, read as "MAR 4" (CORE-162). */
const tileDate = (w: VueWrapper) => `${w.find(".next-visit__month").text()} ${w.find(".next-visit__day").text()}`;
const groupTitles = (w: VueWrapper) => w.findAll(".patient-details__group-title").map((h) => h.text());

describe("PatientDetailsTab (NEO-206)", () => {
  it("fetches the summary for this patient", async () => {
    await mountTab(EMPTY);
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/p-1/summary", { handleErrors: false });
  });

  it("shows the four tiles in order: diagnosis, PSG, treatment, next appointment", async () => {
    const w = await mountTab(FULL);
    expect(tileKeys(w)).toEqual(["tile-diagnosis", "tile-psg", "tile-treatment", "tile-appointment"]);
    expect(w.find('[data-testid="tile-diagnosis"]').text()).toContain("G47.33 · OSA");
    const psg = w.find('[data-testid="tile-psg"]').text();
    expect(psg).toContain("22.4 /h");
    expect(psg).toContain("SpO₂ 84 % · ODI 19");
    expect(w.find('[data-testid="tile-treatment"]').text()).toContain("Ordered");
  });

  it("hides empty tiles; no strip at all when nothing is known", async () => {
    const w = await mountTab(EMPTY, { patient: { diagnosis_code: null, ahi_baseline: null } });
    expect(w.find('[data-testid="summary-strip"]').exists()).toBe(false);
  });

  it("no scored study: the IAH tile shows the baseline, with the severity scale (NEO-247)", async () => {
    const w = await mountTab(EMPTY);
    expect(tileKeys(w)).toEqual(["tile-diagnosis", "tile-ahiBaseline"]);
    const tile = w.find('[data-testid="tile-ahiBaseline"]');
    expect(tile.text()).toContain("AHI baseline");
    expect(tile.text()).toContain("18 /h");
    expect(tile.find(".patient-details__tile-scale").exists()).toBe(true);
  });

  it("a scored study wins over the baseline: one IAH tile, never two", async () => {
    const w = await mountTab(FULL);
    expect(tileKeys(w)).toContain("tile-psg");
    expect(tileKeys(w)).not.toContain("tile-ahiBaseline");
  });

  it("falls back to the study's diagnosis when the patient has none", async () => {
    const w = await mountTab({ ...FULL, latest_study: { ...FULL.latest_study!, diagnosis_code: { code: "G47.30" } } }, { patient: { diagnosis_code: null } });
    expect(w.find('[data-testid="tile-diagnosis"]').text()).toContain("G47.30");
  });

  it("a cancelled device order shows no treatment tile", async () => {
    const w = await mountTab({ ...FULL, device_order: { ...FULL.device_order!, status: "cancelled" } });
    expect(tileKeys(w)).not.toContain("tile-treatment");
  });

  it("commercial field force: no diagnosis tile even when the record has one", async () => {
    const w = await mountTab({ ...FULL, latest_study: null }, { canSeeStudies: false });
    expect(tileKeys(w)).toEqual(["tile-treatment", "tile-appointment"]);
  });

  it("PSG and treatment tiles open their tabs; diagnosis is not a button; the next visit is a button (CORE-159)", async () => {
    const w = await mountTab(FULL);
    await w.find('[data-testid="tile-psg"]').trigger("click");
    await w.find('[data-testid="tile-treatment"]').trigger("click");
    expect(w.emitted("open-tab")).toEqual([["studies"], ["orthoapnea"]]);
    expect(w.find('[data-testid="tile-diagnosis"]').element.tagName).toBe("DIV");
    expect(w.find('[data-testid="next-visit-open"]').element.tagName).toBe("BUTTON");
  });

  it("groups the rows; keeps IAH basal and CPAP; extra rows only when set", async () => {
    const empty = await mountTab(EMPTY);
    expect(groupTitles(empty)).toEqual(["Clinical", "Contact", "Care"]);
    expect(empty.text()).toContain("AHI baseline");
    expect(empty.text()).toContain("CPAP device");
    expect(empty.text()).not.toContain("Preferred name");

    const full = await mountTab(FULL);
    expect(groupTitles(full)).toEqual(["Clinical", "Contact", "Care", "Administrative"]);
    expect(full.text()).toContain("Mafer");
    expect(full.text()).toContain("Masaryk 111, CDMX, 11560");
    expect(full.text()).toContain("Patient since");
  });

  it("a withdrawn data consent shows a red banner", async () => {
    const w = await mountTab({ ...FULL, data_consent_withdrawn_at: "2026-09-20T10:00:00Z" });
    expect(w.find('[data-testid="consent-withdrawn"]').text()).toContain("Data consent withdrawn on");
  });

  it("a failed summary still shows the base rows", async () => {
    const w = await mountTab(null);
    expect(w.find('[data-testid="summary-strip"]').exists()).toBe(true); // diagnosis from the record itself
    expect(w.text()).toContain("+52 55 1234 5678");
  });
});

describe("PatientDetailsTab — every appointment (CORE-133)", () => {
  const APPTS = [
    { id: "a-past", status: "completed", start_at: "2026-09-01T16:00:00.000Z", end_at: "2026-09-01T17:00:00.000Z", timezone: "America/Mexico_City", practitioner_name: "Dra. Ruiz" },
    { id: "a-late", status: "scheduled", start_at: "2031-03-05T22:00:00.000Z", end_at: "2031-03-05T23:00:00.000Z", timezone: "America/Mexico_City", practitioner_name: "Dra. Ruiz" },
    { id: "a-soon", status: "scheduled", start_at: "2031-03-04T21:00:00.000Z", end_at: "2031-03-04T22:00:00.000Z", timezone: "America/Mexico_City", practitioner_name: "Dra. Ruiz" },
    { id: "a-off", status: "cancelled", start_at: "2031-03-06T15:00:00.000Z", end_at: "2031-03-06T16:00:00.000Z", timezone: "America/Mexico_City", practitioner_name: "Dra. Ruiz" },
  ];

  async function mountWithAppointments() {
    setActivePinia(createPinia());
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith("/api/v1/appointments?")
        ? { ok: true, status: 200, json: async () => ({ items: APPTS }) }
        : path.endsWith("/care-team")
          ? { ok: true, status: 200, json: async () => [] }
          : { ok: true, status: 200, json: async () => EMPTY },
    );
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div />" } }, { path: "/hcp/:id", name: "hcp-detail", component: { template: "<div />" } }, { path: "/calendar", name: "calendar", component: { template: "<div />" } }] });
    const wrapper = mount(PatientDetailsTab, {
      props: { patient: PATIENT, canSeeStudies: true },
      global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents }), router] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
  }

  it("lists all of the patient's appointments — upcoming soonest first, then past — in clinic time", async () => {
    const w = await mountWithAppointments();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/appointments?patient_id=p-1", { handleErrors: false });
    const rows = w.findAll('[data-testid="patient-appointment"]');
    expect(rows.map((r) => r.attributes("data-id"))).toEqual(["a-soon", "a-late", "a-off", "a-past"]);
    // 21:00Z is 15:00 at the Mexico City clinic, whatever the reader's zone.
    expect(rows[0]!.text()).toMatch(/0?3:00\s?PM|15:00/);
    expect(rows[2]!.text()).toContain("Cancelled");
  });

  it("the next-appointment tile is the first upcoming scheduled visit, in clinic time", async () => {
    const w = await mountWithAppointments();
    const tile = w.find('[data-testid="tile-appointment"]');
    expect(tileDate(w)).toBe("MAR 4");
    expect(tile.text()).toMatch(/0?3:00\s?PM|15:00/);
  });
});

describe("PatientDetailsTab — events for the patient (CORE-137)", () => {
  const EVENTS = [
    { id: "e-past", type: "visit", status: "completed", start_at: "2026-09-01T16:00:00.000Z", end_at: "2026-09-01T17:00:00.000Z", metadata: { title: "Follow-up at home" } },
    { id: "e-soon", type: "call", status: "scheduled", start_at: "2031-03-04T21:00:00.000Z", end_at: "2031-03-04T22:00:00.000Z", metadata: { title: "Video check-in" } },
    { id: "e-off", type: "visit", status: "cancelled", start_at: "2031-03-06T15:00:00.000Z", end_at: null, metadata: null },
  ];

  async function mountWithEvents(items: unknown[]) {
    setActivePinia(createPinia());
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/encounter?")) return { ok: true, status: 200, json: async () => ({ items, total: items.length }) };
      if (path.startsWith("/api/v1/appointments?")) return { ok: true, status: 200, json: async () => ({ items: [] }) };
      return { ok: true, status: 200, json: async () => EMPTY };
    });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div />" } }, { path: "/hcp/:id", name: "hcp-detail", component: { template: "<div />" } }, { path: "/calendar", name: "calendar", component: { template: "<div />" } }] });
    const wrapper = mount(PatientDetailsTab, {
      props: { patient: PATIENT, canSeeStudies: true },
      global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents }), router] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
  }

  it("asks for the patient's events and lists them — upcoming soonest first, then past — with the type label", async () => {
    const w = await mountWithEvents(EVENTS);
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/encounter?patient_id=p-1", { handleErrors: false });
    const rows = w.findAll('[data-testid="patient-event"]');
    expect(rows.map((r) => r.attributes("data-id"))).toEqual(["e-soon", "e-off", "e-past"]);
    expect(rows[0]!.text()).toContain("Video check-in");
    expect(rows[0]!.text()).toContain("Video call");
    expect(rows[2]!.text()).toContain("Face-to-face");
    expect(rows[1]!.text()).toContain("Cancelled");
    expect(groupTitles(w)).toContain("Events");
  });

  it("lists an event that is shared with other patients", async () => {
    const w = await mountWithEvents([{ ...EVENTS[1]!, id: "e-shared", patient_ids: ["p-1", "p-2"] }]);
    const rows = w.findAll('[data-testid="patient-event"]');
    expect(rows.map((r) => r.attributes("data-id"))).toEqual(["e-shared"]);
  });

  it("shows no Events group for a patient without events", async () => {
    const w = await mountWithEvents([]);
    expect(w.findAll('[data-testid="patient-event"]')).toHaveLength(0);
    expect(groupTitles(w)).not.toContain("Events");
  });
});

describe("PatientDetailsTab — care team (CORE-132)", () => {
  const PRIMARY: CareTeamMember = {
    practitioner_id: "pr-1", name: "Dra. Lorena Ruiz", primary_specialty: "sleep_medicine", specialties: [], primary: true,
    source: null, appointment_id: null, added_by_name: null, added_at: null,
  };
  const ENT: CareTeamMember = {
    practitioner_id: "pr-2", name: "Dr. Juan Pérez", primary_specialty: "ent", specialties: [], primary: false,
    source: "appointment", appointment_id: "a-1", added_by_name: "Ana Coordinadora", added_at: "2026-10-04T10:00:00Z",
  };

  it("lists everyone but the primary doctor, with how and since when they have access", async () => {
    const w = await mountTab(EMPTY, { careTeam: [PRIMARY, ENT], role: "doctor" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/p-1/care-team", { handleErrors: false });
    expect(groupTitles(w)).toContain("Care team");
    expect(w.find('[data-testid="care-team-pr-1"]').exists()).toBe(false);
    const row = w.find('[data-testid="care-team-pr-2"]').text();
    expect(row).toContain("Via a visit");
    expect(row).toContain("Ana Coordinadora");
    expect(row).toContain("Juan");
  });

  it("a doctor neither adds nor removes; the field force only adds; a manager does both (D3)", async () => {
    const doctor = await mountTab(EMPTY, { careTeam: [PRIMARY, ENT], role: "doctor" });
    expect(doctor.find('[data-testid="care-team-add"]').exists()).toBe(false);
    expect(doctor.find('[data-testid="care-team-remove-pr-2"]').exists()).toBe(false);

    const rep = await mountTab(EMPTY, { careTeam: [PRIMARY, ENT], role: "rep" });
    expect(rep.find('[data-testid="care-team-add"]').exists()).toBe(true);
    expect(rep.find('[data-testid="care-team-remove-pr-2"]').exists()).toBe(false);

    const manager = await mountTab(EMPTY, { careTeam: [PRIMARY, ENT], role: "manager" });
    expect(manager.find('[data-testid="care-team-add"]').exists()).toBe(true);
    expect(manager.find('[data-testid="care-team-remove-pr-2"]').exists()).toBe(true);
  });

  it("no team and no right to add: no Care team group at all", async () => {
    const w = await mountTab(EMPTY, { careTeam: [PRIMARY], role: "doctor" });
    expect(groupTitles(w)).not.toContain("Care team");
  });
});

describe("PatientDetailsTab — live refresh, visit links, doctor view (patient card refresh)", () => {
  const SOON = { id: "a-soon", status: "scheduled", start_at: "2031-03-04T21:00:00.000Z", end_at: "2031-03-04T22:00:00.000Z", timezone: "America/Mexico_City", practitioner_name: "Dra. Ruiz" };
  const NEW = { ...SOON, id: "a-new", start_at: "2031-03-02T21:00:00.000Z", end_at: "2031-03-02T22:00:00.000Z" };
  const TEAM: CareTeamMember[] = [{
    practitioner_id: "pr-2", name: "Dr. Juan Pérez", primary_specialty: "ent", specialties: [], primary: false,
    source: "appointment", appointment_id: "a-1", added_by_name: null, added_at: null,
  }];

  interface Server { appointments: unknown[]; events: unknown[]; summary: PatientSummary; version: string; fail: boolean; patched: { path: string; body: unknown }[] }
  let server: Server;

  async function mountLive(opts: { role?: string; active?: boolean } = {}) {
    server = { appointments: [SOON], events: [], summary: EMPTY, version: "v1", fail: false, patched: [] };
    setActivePinia(createPinia());
    if (opts.role) useAuthStore().user = { id: "u-1", role: opts.role } as NonNullable<ReturnType<typeof useAuthStore>["user"]>;
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (server.fail) return { ok: false, status: 503, json: async () => ({}) };
      if (init?.method === "PATCH") {
        server.patched.push({ path, body: JSON.parse(init.body ?? "{}") });
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (path.startsWith("/api/v1/appointments?")) return { ok: true, status: 200, json: async () => ({ items: server.appointments }) };
      if (path.startsWith("/api/v1/encounter?")) return { ok: true, status: 200, json: async () => ({ items: server.events, total: server.events.length }) };
      if (path.endsWith("/care-team")) return { ok: true, status: 200, json: async () => TEAM };
      if (path.endsWith("/version")) return { ok: true, status: 200, json: async () => ({ version: server.version }) };
      return { ok: true, status: 200, json: async () => server.summary };
    });
    // The real routes: who may open an HCP record comes from hcp-detail's own meta.roles.
    const router = createRouter({ history: createMemoryHistory(), routes });
    const wrapper = mount(PatientDetailsTab, {
      props: { patient: { ...PATIENT, practitioner_id: "pr-1", practitioner_name: "Dra. Lorena Ruiz" }, canSeeStudies: true, active: opts.active ?? true },
      global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents }), router] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
  }
  const rowIds = (w: VueWrapper) => w.findAll('[data-testid="patient-appointment"]').map((r) => r.attributes("data-id"));
  const calls = (part: string) => apiFetch.mock.calls.filter(([p]) => String(p).includes(part)).length;

  it("a visit booked from the card shows up without remounting the tab", async () => {
    const w = await mountLive();
    server.appointments = [SOON, NEW];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    expect(rowIds(w)).toEqual(["a-new", "a-soon"]);
  });

  it("a change on another patient's card is ignored", async () => {
    const w = await mountLive();
    server.appointments = [SOON, NEW];
    emitPatientChanged("p-2", "visits");
    await flushPromises();
    expect(rowIds(w)).toEqual(["a-soon"]);
  });

  it("a saved study (checklist moved) reloads the summary strip", async () => {
    const w = await mountLive();
    server.summary = FULL;
    window.dispatchEvent(new CustomEvent(CHECKLIST_UPDATED, { detail: { patientId: "p-1", version: "v2" } }));
    await flushPromises();
    expect(w.find('[data-testid="tile-psg"]').exists()).toBe(true);
  });

  it("a silent refresh that fails keeps what is on screen", async () => {
    const w = await mountLive();
    server.fail = true;
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    expect(rowIds(w)).toEqual(["a-soon"]);
  });

  it("coming back to the Details tab reloads it", async () => {
    const w = await mountLive({ active: false });
    server.appointments = [SOON, NEW];
    await w.setProps({ active: true });
    await flushPromises();
    expect(rowIds(w)).toEqual(["a-new", "a-soon"]);
  });

  it("back to the app: checks the fingerprint and reloads only when it moved", async () => {
    const w = await mountLive();
    const before = calls("/appointments?");
    const versions = calls("/p-1/version");
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(calls("/p-1/version")).toBe(versions + 1);
    expect(calls("/appointments?")).toBe(before); // same fingerprint → nothing reloaded

    server.version = "v2";
    server.appointments = [SOON, NEW];
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(rowIds(w)).toEqual(["a-new", "a-soon"]);
  });

  // CORE-159: the visit opens on the card, in the same dialogs the calendar uses.
  const EVENT_SOONER = { id: "e-sooner", type: "visit", status: "scheduled", start_at: "2031-03-01T18:00:00.000Z", end_at: "2031-03-01T19:00:00.000Z", metadata: { title: "Home visit" } };

  it("the next-appointment tile opens that visit's detail dialog on the card", async () => {
    const w = await mountLive();
    await w.find('[data-testid="next-visit-open"]').trigger("click");
    await flushPromises();
    const dialog = w.findComponent({ name: "AppointmentDetailDialog" });
    expect(dialog.props("modelValue")).toBe(true);
    expect(dialog.props("appointment")).toMatchObject({ id: "a-soon" });
  });

  it("every visit row opens the same detail dialog", async () => {
    const w = await mountLive();
    await w.find('[data-testid="patient-appointment-open"]').trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "AppointmentDetailDialog" }).props("appointment")).toMatchObject({ id: "a-soon" });
  });

  it("an event sooner than the next appointment is the next visit, and the tile opens it in the event form", async () => {
    const w = await mountLive();
    server.events = [EVENT_SOONER];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    expect(tileDate(w)).toBe("MAR 1");
    await w.find('[data-testid="next-visit-open"]').trigger("click");
    await flushPromises();
    const form = w.findComponent({ name: "EventForm" });
    expect(form.props("modelValue")).toBe(true);
    expect(form.props("initialData")).toMatchObject({ id: "e-sooner", title: "Home visit" });
  });

  it("a cancelled event is never the next visit", async () => {
    const w = await mountLive();
    server.events = [{ ...EVENT_SOONER, status: "cancelled" }];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    expect(tileDate(w)).toBe("MAR 4");
  });

  it("an event edited from the card is saved and the tile follows without F5", async () => {
    const w = await mountLive();
    server.events = [EVENT_SOONER];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    await w.find('[data-testid="patient-event-open"]').trigger("click");
    await flushPromises();
    const moved = { ...EVENT_SOONER, start_at: "2031-03-03T18:00:00.000Z", end_at: "2031-03-03T19:00:00.000Z" };
    server.events = [moved];
    const done = vi.fn();
    w.findComponent({ name: "EventForm" }).vm.$emit(
      "submit",
      { id: "e-sooner", title: "Home visit", start_at: "2031-03-03T18:00:00.000Z", end_at: "2031-03-03T19:00:00.000Z", type: "f2f", status: "scheduled", region: "mx", patient_ids: ["p-1"], attendees: [] },
      done,
    );
    await flushPromises();
    expect(server.patched.map((p) => p.path)).toEqual(["/api/v1/encounter/e-sooner"]);
    expect(done).toHaveBeenCalledWith(true);
    expect(tileDate(w)).toBe("MAR 3");
  });

  // CORE-162 (variant C): what the visit is, the patient's answer, and Reschedule / Done on the tile.
  it("the tile names the visit and shows the patient's answer", async () => {
    const w = await mountLive({ role: "manager" });
    server.appointments = [{ ...SOON, patient_response: "confirmed" }];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    expect(w.find(".next-visit__title").text()).toBe("Appointment with Dra. Ruiz");
    expect(w.find('[data-testid="next-visit-chip"]').text()).toBe("Patient confirmed");
  });

  it("an event shows its title and kind, never a patient answer", async () => {
    const w = await mountLive({ role: "manager" });
    server.events = [EVENT_SOONER];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    expect(w.find(".next-visit__title").text()).toBe("Home visit");
    expect(w.find('[data-testid="next-visit-chip"]').text()).toBe("Event · Face-to-face");
  });

  it("Done asks first, then marks the appointment completed without opening it", async () => {
    const w = await mountLive({ role: "manager" });
    await w.find('[data-testid="next-visit-complete"]').trigger("click");
    await flushPromises();
    expect(server.patched).toEqual([]);
    w.findAllComponents({ name: "AppConfirmDialog" }).find((c) => c.props("text") === "Mark this visit as completed?")!.vm.$emit("primary");
    await flushPromises();
    expect(server.patched).toEqual([{ path: "/api/v1/appointments/a-soon", body: { status: "completed" } }]);
    expect(w.findComponent({ name: "AppointmentDetailDialog" }).props("modelValue")).toBe(false);
  });

  it("Done on an event sets only its status", async () => {
    const w = await mountLive({ role: "manager" });
    server.events = [EVENT_SOONER];
    emitPatientChanged("p-1", "visits");
    await flushPromises();
    await w.find('[data-testid="next-visit-complete"]').trigger("click");
    w.findAllComponents({ name: "AppConfirmDialog" }).find((c) => c.props("text") === "Mark this visit as completed?")!.vm.$emit("primary");
    await flushPromises();
    expect(server.patched).toEqual([{ path: "/api/v1/encounter/e-sooner", body: { status: "completed" } }]);
  });

  it("Reschedule opens the booking dialog for that appointment, on the card", async () => {
    const w = await mountLive({ role: "manager" });
    await w.find('[data-testid="next-visit-reschedule"]').trigger("click");
    await flushPromises();
    const booking = w.findComponent({ name: "AppointmentDialog" });
    expect(booking.props("modelValue")).toBe(true);
    expect(booking.props("appointment")).toMatchObject({ id: "a-soon" });
  });

  it("a rep who didn't book the visit gets no quick actions — only what the API would allow", async () => {
    const w = await mountLive({ role: "rep" });
    expect(w.find('[data-testid="next-visit-open"]').exists()).toBe(true);
    expect(w.find('[data-testid="next-visit-reschedule"]').exists()).toBe(false);
    expect(w.find('[data-testid="next-visit-complete"]').exists()).toBe(false);
  });

  it("a doctor sees HCP names as plain text (doctors have no HCP detail); other roles get links", async () => {
    const doctor = await mountLive({ role: "doctor" });
    expect(doctor.find('[href^="/hcp/"]').exists()).toBe(false);
    expect(doctor.text()).toContain("Lorena Ruiz");
    expect(doctor.text()).toContain("Juan");

    const manager = await mountLive({ role: "manager" });
    expect(manager.find('[href="/hcp/pr-1"]').exists()).toBe(true);
    expect(manager.find('[href="/hcp/pr-2"]').exists()).toBe(true);
  });
});
