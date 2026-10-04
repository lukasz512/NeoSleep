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

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

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

async function mountTab(summary: PatientSummary | null, opts: { canSeeStudies?: boolean; patient?: Partial<PatientDetailsTabPatient> } = {}) {
  setActivePinia(createPinia());
  apiFetch.mockResolvedValue(summary ? { ok: true, status: 200, json: async () => summary } : { ok: false, status: 500, json: async () => ({}) });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div />" } }, { path: "/hcp/:id", name: "hcp-detail", component: { template: "<div />" } }] });
  const wrapper = mount(PatientDetailsTab, {
    props: { patient: { ...PATIENT, ...opts.patient }, canSeeStudies: opts.canSeeStudies ?? true },
    global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents }), router] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const tileKeys = (w: VueWrapper) => w.findAll(".patient-details__tile").map((t) => t.attributes("data-testid"));
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
    const w = await mountTab(EMPTY, { patient: { diagnosis_code: null } });
    expect(w.find('[data-testid="summary-strip"]').exists()).toBe(false);
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

  it("PSG and treatment tiles open their tabs; the others are not buttons", async () => {
    const w = await mountTab(FULL);
    await w.find('[data-testid="tile-psg"]').trigger("click");
    await w.find('[data-testid="tile-treatment"]').trigger("click");
    expect(w.emitted("open-tab")).toEqual([["studies"], ["orthoapnea"]]);
    expect(w.find('[data-testid="tile-appointment"]').element.tagName).toBe("DIV");
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
        : { ok: true, status: 200, json: async () => EMPTY },
    );
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div />" } }, { path: "/hcp/:id", name: "hcp-detail", component: { template: "<div />" } }] });
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
    expect(tile.text()).toContain("Mar 4");
    expect(tile.text()).toMatch(/0?3:00\s?PM|15:00/);
  });
});
