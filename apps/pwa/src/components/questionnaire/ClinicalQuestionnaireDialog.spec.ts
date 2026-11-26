import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import ClinicalQuestionnaireDialog from "./ClinicalQuestionnaireDialog.vue";

/** NEO-231 (Dra. Lorena, round 1): no tooth field, the ATM evaluation, STOP-BANG weight against the card's height. */
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function open(props: Record<string, unknown>) {
  setActivePinia(createPinia());
  const wrapper = mount(ClinicalQuestionnaireDialog, {
    props: { modelValue: true, mode: "create", ...props },
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
const buttonByText = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

describe("ClinicalQuestionnaireDialog (NEO-231)", () => {
  it("the oral exam asks no tooth and no ATM yes/no any more", async () => {
    await open({ kind: "oral_exam" });
    expect(document.body.textContent).not.toContain("Tooth");
    expect(document.body.textContent).not.toContain("TMJ finding");
    expect(document.body.textContent).toContain("Bruxism");
  });

  it("an older oral exam still shows its ATM answer, read-only", async () => {
    await open({ kind: "oral_exam", mode: "view", record: { kind: "oral_exam", id: "oe-1", created_at: "2026-09-01T10:00:00Z", source: "staff", recorded_by_name: null, has_tmj_finding: true } });
    expect(document.body.textContent).toContain("TMJ finding");
  });

  it("saves the ATM evaluation: the sides ticked, the rest false, the opening as a number", async () => {
    const wrapper = await open({ kind: "tmj_exam" });
    (document.body.querySelector("[data-finding='pain_palpation'][data-side='right']") as HTMLButtonElement).click();
    const opening = document.body.querySelector(".tmj-form__opening input") as HTMLInputElement;
    opening.value = "42";
    opening.dispatchEvent(new Event("input"));
    await flushPromises();
    buttonByText("Save")!.click();
    await flushPromises();
    const [payload] = wrapper.emitted("save")!.at(-1) as [Record<string, unknown>];
    expect(payload).toMatchObject({ pain_palpation_right: true, pain_palpation_left: false, muscle_pain_right: false, max_opening_mm: 42 });
  });

  it("STOP-BANG sends the weight with the card's height, never asks for it", async () => {
    const wrapper = await open({ kind: "stop_bang", heightCm: 160, dateOfBirth: "1970-01-01", gender: "male" });
    expect([...document.body.querySelectorAll("label")].map((l) => l.textContent)).not.toContain("Height");
    for (const key of ["snoring", "tiredness", "observed_apnea", "pressure"]) {
      (document.body.querySelector(`[aria-labelledby='sb-${key}'] button`) as HTMLButtonElement).click();
      await flushPromises();
    }
    const weight = [...document.body.querySelectorAll("input")].find((i) => i.closest(".v-input")?.textContent?.includes("Weight")) as HTMLInputElement;
    weight.value = "100";
    weight.dispatchEvent(new Event("input"));
    const neck = [...document.body.querySelectorAll("input")].find((i) => i.closest(".v-input")?.textContent?.includes("Neck")) as HTMLInputElement;
    neck.value = "38";
    neck.dispatchEvent(new Event("input"));
    await flushPromises();
    buttonByText("Save")!.click();
    await flushPromises();
    const [payload] = wrapper.emitted("save")!.at(-1) as [Record<string, unknown>];
    expect(payload).toMatchObject({ height_cm: "160", weight_kg: "100", bmi_over_35: true, is_male: true });
  });
});
