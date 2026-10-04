import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import TmjExamForm from "./TmjExamForm.vue";
import { emptyTmjAnswers, tmjAnswersValid, tmjMarkedSides } from "../../config/questionnaires";

/** NEO-231 D3 (Dra. Lorena): the ATM evaluation — five findings per side, the opening in mm, a skull that shows the side. */
const plugins = () => [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })];

function mountForm(over: Record<string, unknown> = {}) {
  return mount(TmjExamForm, {
    props: { modelValue: emptyTmjAnswers(), opening: "", readonly: false, ...over },
    global: { plugins: plugins() },
  });
}
const lastAnswers = (wrapper: ReturnType<typeof mountForm>) =>
  (wrapper.emitted("update:modelValue") as Record<string, boolean>[][]).at(-1)![0]!;

describe("TmjExamForm", () => {
  it("lists the five findings with a Right and a Left box each, plus the maximum opening", () => {
    const wrapper = mountForm();
    for (const label of ["Pain on palpation", "Joint sounds (clicking / crepitus)", "Limited opening", "Deviation on opening", "Muscle pain (masseter / temporal)", "Maximum opening"]) {
      expect(wrapper.text()).toContain(label);
    }
    expect(wrapper.findAll("[data-side='right']")).toHaveLength(5);
    expect(wrapper.findAll("[data-side='left']")).toHaveLength(5);
  });

  it("ticking a side marks that finding for that side only", async () => {
    const wrapper = mountForm();
    await wrapper.find("[data-finding='joint_sounds'][data-side='left']").trigger("click");
    expect(lastAnswers(wrapper)).toMatchObject({ joint_sounds_left: true, joint_sounds_right: false });
  });

  it("the skull lights the joint of each side that has a finding", () => {
    const wrapper = mountForm({ modelValue: { ...emptyTmjAnswers(), pain_palpation_right: true } });
    expect(wrapper.find("[data-joint='right']").classes()).toContain("tmj-skull__joint--on");
    expect(wrapper.find("[data-joint='left']").classes()).not.toContain("tmj-skull__joint--on");
  });

  it("read-only shows the marks without buttons, and the opening in mm", () => {
    const wrapper = mountForm({ readonly: true, modelValue: { ...emptyTmjAnswers(), muscle_pain_left: true }, opening: "38" });
    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(wrapper.text()).toContain("38 mm");
  });

  it("shows the old single yes/no answer of an earlier oral exam, read-only", () => {
    const wrapper = mountForm({ legacyFinding: true });
    expect(wrapper.text()).toContain("Earlier oral exam: TMJ finding — Yes");
  });
});

describe("TMJ answer rules", () => {
  it("valid with a finding or an opening of 0–80 whole mm; empty or out of range is not", () => {
    expect(tmjAnswersValid(emptyTmjAnswers(), "")).toBe(false);
    expect(tmjAnswersValid({ ...emptyTmjAnswers(), muscle_pain_right: true }, "")).toBe(true);
    expect(tmjAnswersValid(emptyTmjAnswers(), "0")).toBe(true);
    expect(tmjAnswersValid(emptyTmjAnswers(), "81")).toBe(false);
    expect(tmjAnswersValid(emptyTmjAnswers(), "40.5")).toBe(false);
  });

  it("knows which sides have a finding", () => {
    expect(tmjMarkedSides({ ...emptyTmjAnswers(), opening_deviation_left: true })).toEqual({ right: false, left: true });
  });
});
