import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import PatientIntakeForms from "./PatientIntakeForms.vue";
import type { PatientIntakeFormStatus } from "../../types/patientIntakeForm";
import { intakeFormIcon, initialsAbbr } from "../../config/patientIntakeForms";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountForms(forms: PatientIntakeFormStatus[]): VueWrapper {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PatientIntakeForms, { props: { forms }, global: { plugins: [i18n, vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

const FORMS: PatientIntakeFormStatus[] = [
  { key: "informedConsent", done: false },
  { key: "historiaEndo", done: true },
  { key: "stopBang", done: true },
  { key: "polysomnography", done: false },
];

describe("PatientIntakeForms", () => {
  it("renders one tile per form, in the given order, with collected ones marked", () => {
    const wrapper = mountForms(FORMS);
    const tiles = wrapper.findAll(".intake-forms__tile");
    expect(tiles).toHaveLength(4);
    expect(tiles.map((d) => d.classes().includes("intake-forms__tile--done"))).toEqual([false, true, true, false]);
  });

  it("shows the clinical abbreviation on each tile, in order (NEO-57)", () => {
    const wrapper = mountForms(FORMS);
    expect(wrapper.findAll(".intake-forms__tile").map((d) => d.text())).toEqual(["CI", "HE", "SB", "PSG"]);
  });

  it("falls back to initials of the form label for a template without an abbreviation", () => {
    expect(initialsAbbr("Informed consent")).toBe("IC");
    expect(initialsAbbr("Sleep-apnea follow up form")).toBe("SAF");
  });

  it("labels the progress for screen readers", () => {
    const wrapper = mountForms(FORMS);
    expect(wrapper.find(".intake-forms").attributes("aria-label")).toBe("2 of 4 forms collected");
  });

  it("shows a dash when there are no forms", () => {
    const wrapper = mountForms([]);
    expect(wrapper.find(".intake-forms").exists()).toBe(false);
    expect(wrapper.text()).toBe("—");
  });
});

describe("intakeFormIcon", () => {
  it("gives every known form its own icon and falls back to a generic file icon", () => {
    const icons = FORMS.map((f) => intakeFormIcon(f.key));
    expect(new Set(icons).size).toBe(FORMS.length);
    expect(intakeFormIcon("someNewTemplate")).toBe("file");
  });
});
