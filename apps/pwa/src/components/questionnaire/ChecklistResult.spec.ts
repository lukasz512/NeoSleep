import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import ChecklistResult from "./ChecklistResult.vue";
import type { ChecklistHistoryEntry, ChecklistRecord } from "../../composables/usePatientChecklist";

const i18nPlugin = () => createI18n({ legacy: false, locale: "en", messages: { en } });

/** ATM result in the history: a mini copy of the exam, findings split into right / left columns. */
const mountTmj = (record: Record<string, unknown>) =>
  mount(ChecklistResult, {
    // Test fixture: only the record fields the TMJ branch reads.
    props: { entry: { record: { kind: "tmj_exam", ...record } } as unknown as ChecklistHistoryEntry },
    global: { plugins: [i18nPlugin()] },
  });

const mark = (wrapper: ReturnType<typeof mountTmj>, finding: string, side: string) =>
  wrapper.find(`td[data-finding='${finding}'][data-side='${side}'] .tmj-mini__mark`);

describe("ChecklistResult — ATM exam", () => {
  it("lists every finding once, with its right and left mark in their own columns", () => {
    const wrapper = mountTmj({ pain_palpation_right: true, opening_deviation_left: true, opening_deviation_right: true });
    expect(wrapper.findAll("tbody tr")).toHaveLength(5);
    expect(mark(wrapper, "pain_palpation", "right").classes()).toContain("tmj-mini__mark--on");
    expect(mark(wrapper, "pain_palpation", "left").classes()).not.toContain("tmj-mini__mark--on");
    expect(mark(wrapper, "opening_deviation", "left").classes()).toContain("tmj-mini__mark--on");
    expect(wrapper.findAll(".tmj-mini__row--on")).toHaveLength(2);
  });

  it("the column headers carry the count per side", () => {
    const wrapper = mountTmj({ pain_palpation_right: true, joint_sounds_right: true, muscle_pain_left: true });
    const heads = wrapper.findAll("thead th").map((th) => th.text());
    expect(heads[1]).toBe("Right 2");
    expect(heads[2]).toBe("Left 1");
  });

  it("shows the maximum opening as the last row, only when recorded", () => {
    expect(mountTmj({ max_opening_mm: 42 }).find(".tmj-mini__opening").text()).toContain("42 mm");
    expect(mountTmj({}).find(".tmj-mini__opening").exists()).toBe(false);
  });
});

/** Łukasz 2026-10-05 (option A + B's meter): every question is a row, a segment meter sums it up. */
const entry = (record: Partial<ChecklistRecord>): ChecklistHistoryEntry =>
  ({ id: "e1", type: "record", created_at: "2026-10-05T10:00:00Z", source: "staff", by: null, record }) as ChecklistHistoryEntry;

const mountResult = (record: Partial<ChecklistRecord>) =>
  mount(ChecklistResult, { props: { entry: entry(record) }, global: { plugins: [i18nPlugin()] } });

const rows = (wrapper: ReturnType<typeof mountResult>) => wrapper.findAll("[data-question]");

describe("ChecklistResult — clinical questionnaire", () => {
  it("oral exam: one row per question with its own status, findings and normals both visible", () => {
    const wrapper = mountResult({ kind: "oral_exam", has_bruxism: true, has_narrow_palate: false, has_xerostomia: true });
    expect(rows(wrapper)).toHaveLength(7);
    const bruxism = wrapper.find("[data-question='has_bruxism']");
    expect(bruxism.attributes("data-state")).toBe("yes");
    expect(bruxism.text()).toContain("Bruxism");
    expect(bruxism.text()).toContain("Yes");
    const palate = wrapper.find("[data-question='has_narrow_palate']");
    expect(palate.attributes("data-state")).toBe("no");
    expect(palate.text()).toContain("Normal");
    expect(wrapper.find("[data-question='has_missing_teeth']").attributes("data-state")).toBe("todo");
  });

  it("summary: count of findings over the question total, one meter segment per question", () => {
    const wrapper = mountResult({ kind: "oral_exam", has_bruxism: true, has_xerostomia: true, has_narrow_palate: false });
    expect(wrapper.find(".checklist-result__total").text()).toBe("2 / 7");
    expect(wrapper.find(".checklist-result__summary").text()).toContain("with a finding");
    const segments = wrapper.findAll(".checklist-result__meter i");
    expect(segments).toHaveLength(7);
    expect(segments.filter((s) => s.classes("yes"))).toHaveLength(2);
    expect(wrapper.find(".checklist-result__meter").attributes("aria-label")).toBe("2 of 7 answered yes");
  });

  it("skeletal class is a value beside the summary, not a finding row", () => {
    const wrapper = mountResult({ kind: "oral_exam", skeletal_class: "II" });
    expect(wrapper.find(".checklist-result__value").text()).toBe("Skeletal class II");
    expect(rows(wrapper).some((r) => r.text().includes("Skeletal class"))).toBe(false);
  });

  it("medical history: rows read Yes / No and 'other' shows as its own line", () => {
    const wrapper = mountResult({ kind: "medical_history", has_hypertension: true, has_diabetes: false, medical_history_other: "Asthma" });
    expect(wrapper.find(".checklist-result__summary").text()).toContain("answered yes");
    expect(wrapper.find("[data-question='has_diabetes']").text()).toContain("No");
    expect(wrapper.find(".checklist-result__other").text()).toBe("Other: Asthma");
  });
});
