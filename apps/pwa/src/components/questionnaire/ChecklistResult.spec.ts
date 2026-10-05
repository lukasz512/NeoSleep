import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import ChecklistResult from "./ChecklistResult.vue";
import type { ChecklistHistoryEntry } from "../../composables/usePatientChecklist";

/** ATM result in the history: a mini copy of the exam, findings split into right / left columns. */
const mountTmj = (record: Record<string, unknown>) =>
  mount(ChecklistResult, {
    // Test fixture: only the record fields the TMJ branch reads.
    props: { entry: { record: { kind: "tmj_exam", ...record } } as unknown as ChecklistHistoryEntry },
    global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })] },
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
