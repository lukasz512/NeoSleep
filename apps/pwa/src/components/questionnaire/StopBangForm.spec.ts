import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import StopBangForm from "./StopBangForm.vue";
import StopBangScoreGauge from "./StopBangScoreGauge.vue";
import { stopBangMeasuresValid, parseStopBangMeasure } from "../../config/questionnaires";

const plugins = () => {
  setActivePinia(createPinia());
  return [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })];
};

const STOP = { snoring: true, tiredness: false, observed_apnea: true, pressure: false };
const EMPTY_BANG = { bmi_over_35: null, age_over_50: null, neck_circumference_over_40cm: null, is_male: null };

function mountForm(over: Record<string, unknown> = {}) {
  const measures = reactive({ height_cm: "", weight_kg: "", neck_cm: "" });
  const wrapper = mount(StopBangForm, {
    props: {
      modelValue: { ...STOP, ...EMPTY_BANG },
      measures,
      mode: "completeBang",
      record: { kind: "stop_bang", id: "r1", created_at: "2026-09-25T20:32:00Z", source: "patient", recorded_by_name: null, score: null },
      dateOfBirth: "1970-03-12",
      gender: "female",
      ...over,
    },
    global: { plugins: plugins() },
  });
  return { wrapper, measures };
}

const emitted = (wrapper: ReturnType<typeof mount>) => {
  const all = wrapper.emitted("update:modelValue") as Record<string, boolean | null>[][] | undefined;
  return all?.at(-1)?.[0] ?? {};
};

describe("StopBangForm — the specialist's view", () => {
  it("works A out from the date of birth and G from the record's sex, without asking", () => {
    const { wrapper } = mountForm();
    expect(emitted(wrapper)).toMatchObject({ age_over_50: true, is_male: false });
    expect(wrapper.text()).toContain("From the record:");
  });

  it("B and N follow the measurements: height + weight → BMI, neck in cm", async () => {
    const { wrapper, measures } = mountForm();
    measures.height_cm = "162";
    measures.weight_kg = "94,5";
    measures.neck_cm = "42";
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("BMI 36 kg/m²");
    expect(emitted(wrapper)).toMatchObject({ bmi_over_35: true, neck_circumference_over_40cm: true });
  });

  it("stamps the patient's own answers and shows them read-only", () => {
    const { wrapper } = mountForm();
    expect(wrapper.text()).toContain("Answered by the patient via their personal link");
    // S-T-O-P has no toggles in completeBang mode — only the four answer badges.
    expect(wrapper.findAll(".sb-form__row").slice(0, 4).every((row) => !row.find(".v-btn-toggle").exists())).toBe(true);
  });

  it("asks G by hand when the record has no sex", () => {
    const { wrapper } = mountForm({ gender: null });
    expect(emitted(wrapper).is_male ?? null).toBeNull();
    const genderRow = wrapper.findAll(".sb-form__row").at(-1)!;
    expect(genderRow.find(".v-btn-toggle").exists()).toBe(true);
  });
});

describe("StopBangScoreGauge", () => {
  const keys = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const all = (yes: number) => Object.fromEntries(keys.map((k, i) => [k, i < yes]));

  it.each([
    [2, "Low risk"],
    [4, "Intermediate risk"],
    [5, "High risk"],
  ])("%i of 8 → %s", (yes, label) => {
    const wrapper = mount(StopBangScoreGauge, { props: { answers: all(yes), keys }, global: { plugins: plugins() } });
    expect(wrapper.text()).toContain(`${yes} / 8`);
    expect(wrapper.text()).toContain(label);
  });

  it("shows how many answers are missing instead of a risk while incomplete", () => {
    const wrapper = mount(StopBangScoreGauge, { props: { answers: { a: true, b: null }, keys }, global: { plugins: plugins() } });
    expect(wrapper.text()).toContain("7 to go");
    expect(wrapper.text()).not.toContain("risk");
  });
});

describe("STOP-Bang measurement validation", () => {
  it("accepts a decimal comma, rejects out-of-range values and a height without a weight", () => {
    expect(parseStopBangMeasure("94,5", "weight_kg")).toBe(94.5);
    expect(parseStopBangMeasure("1620", "height_cm")).toBe("invalid");
    expect(parseStopBangMeasure("", "neck_cm")).toBeNull();
    expect(stopBangMeasuresValid({ height_cm: "162", weight_kg: "", neck_cm: "" })).toBe(false);
    expect(stopBangMeasuresValid({ height_cm: "162", weight_kg: "94", neck_cm: "42" })).toBe(true);
    expect(stopBangMeasuresValid({ height_cm: "", weight_kg: "", neck_cm: "" })).toBe(true);
  });
});
