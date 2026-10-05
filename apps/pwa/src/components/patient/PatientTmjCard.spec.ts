import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import PatientTmjCard from "./PatientTmjCard.vue";
import { CHECKLIST_UPDATED } from "../../composables/usePatientChecklist";

/** NEO-237 D1: the latest ATM evaluation on Detalles → Clínico, read-only, opening its tab on click. */
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const tmj = (over: Record<string, unknown> = {}) => ({
  kind: "tmj_exam", id: "tmj-1", created_at: "2026-10-04T10:00:00Z", source: "staff", recorded_by_name: "Dra. Test",
  pain_palpation_right: true, joint_sounds_right: true, opening_limitation_right: false, opening_deviation_right: false, muscle_pain_right: false,
  pain_palpation_left: false, joint_sounds_left: true, opening_limitation_left: false, opening_deviation_left: false, muscle_pain_left: false,
  max_opening_mm: 38, ...over,
});
const mountCard = async () => {
  const wrapper = mount(PatientTmjCard, { props: { patientId: "p-1" }, global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })] } });
  await flushPromises();
  return wrapper;
};

describe("PatientTmjCard", () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => apiFetch.mockReset());

  it("shows the latest ATM evaluation: findings per side, the opening, the date and a lit skull", async () => {
    apiFetch.mockResolvedValue(json({ records: [tmj({ id: "old", created_at: "2026-09-01T10:00:00Z", max_opening_mm: 20 }), tmj()].reverse(), pending_requests: [] }));
    const wrapper = await mountCard();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/p-1/clinical-records", expect.anything());
    expect(wrapper.text()).toContain("2 findings");
    expect(wrapper.text()).toContain("1 finding");
    expect(wrapper.text()).toContain("38 mm");
    expect(wrapper.find("[data-joint='right']").attributes("data-level")).toBe("2");
    // D2 (more): pencil on the patient card, ink stays in the ATM tab.
    expect(wrapper.find("svg").classes()).toContain("tmj-skull__svg--pencil");
  });

  it("no ATM record shows the empty state", async () => {
    apiFetch.mockResolvedValue(json({ records: [{ kind: "oral_exam", id: "oe", created_at: "2026-10-01T10:00:00Z" }], pending_requests: [] }));
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain("No TMJ evaluation yet");
    expect(wrapper.findAll(".tmj-skull__joint--on")).toHaveLength(0);
  });

  it("clicking it opens the ATM tab of the Historia clínica", async () => {
    apiFetch.mockResolvedValue(json({ records: [tmj()], pending_requests: [] }));
    const wrapper = await mountCard();
    await wrapper.find("[data-testid='tmj-card']").trigger("click");
    expect(wrapper.emitted("open")).toEqual([[]]);
  });

  it("re-reads after a clinical record is saved for this patient, not for another one (NEO-240)", async () => {
    apiFetch.mockResolvedValue(json({ records: [], pending_requests: [] }));
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain("No TMJ evaluation yet");

    apiFetch.mockResolvedValue(json({ records: [tmj()], pending_requests: [] }));
    window.dispatchEvent(new CustomEvent(CHECKLIST_UPDATED, { detail: { patientId: "p-2", version: "v2" } }));
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent(CHECKLIST_UPDATED, { detail: { patientId: "p-1", version: "v2" } }));
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("38 mm");
  });
});
