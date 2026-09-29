import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import QuestionnaireChecklist from "./QuestionnaireChecklist.vue";
import { MEDICAL_HISTORY_QUESTIONS } from "../../config/questionnaires";

function mountWithModel() {
  const answers = ref<Record<string, boolean | null>>(Object.fromEntries(MEDICAL_HISTORY_QUESTIONS.map((q) => [q.key, null])));
  const Host = defineComponent({
    setup: () => () =>
      h(QuestionnaireChecklist, {
        questions: MEDICAL_HISTORY_QUESTIONS,
        modelValue: answers.value,
        "onUpdate:modelValue": (value: Record<string, boolean | null>) => (answers.value = value),
      }),
  });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(Host, { global: { plugins: [i18n, vuetify] } });
  return { wrapper, answers };
}

describe("QuestionnaireChecklist", () => {
  it("keeps every answer when several are given before the parent re-renders (fast taps / autofill)", async () => {
    const { wrapper, answers } = mountWithModel();

    // All clicks in one synchronous burst — no re-render in between.
    const noButtons = wrapper.findAll("button").filter((b) => b.text() === "No");
    for (const button of noButtons) (button.element as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();

    expect(Object.values(answers.value).every((v) => v === false)).toBe(true);
    wrapper.unmount();
  });
});
