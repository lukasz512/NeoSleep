import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import PatientIntakeDots from "./PatientIntakeDots.vue";
import type { PatientIntakeFormStatus } from "../../types/patientIntakeForm";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountDots(forms: PatientIntakeFormStatus[]): VueWrapper {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PatientIntakeDots, { props: { forms }, global: { plugins: [i18n, vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

const FORMS: PatientIntakeFormStatus[] = [
  { key: "informedConsent", done: false },
  { key: "historiaEndo", done: true },
  { key: "stopBang", done: true },
];

describe("PatientIntakeDots", () => {
  it("renders one dot per form, in the given order, with done dots marked", () => {
    const wrapper = mountDots(FORMS);
    const dots = wrapper.findAll(".intake-dots__dot");
    expect(dots).toHaveLength(3);
    expect(dots.map((d) => d.classes().includes("intake-dots__dot--done"))).toEqual([false, true, true]);
  });

  it("labels the progress for screen readers", () => {
    const wrapper = mountDots(FORMS);
    expect(wrapper.find(".intake-dots").attributes("aria-label")).toBe("2 of 3 forms collected");
  });

  it("shows a dash when no forms are assigned to patients", () => {
    const wrapper = mountDots([]);
    expect(wrapper.find(".intake-dots").exists()).toBe(false);
    expect(wrapper.text()).toBe("—");
  });
});
