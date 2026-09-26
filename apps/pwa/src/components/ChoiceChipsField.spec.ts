import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import ChoiceChipsField from "./ChoiceChipsField.vue";
import type { FormFieldOption } from "../types/formField";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

const ITEMS: FormFieldOption[] = [
  { title: "Female", value: "female", symbol: "♀" },
  { title: "Male", value: "male", symbol: "♂" },
  { title: "Other", value: "other", secondary: true },
  { title: "Prefer not to say", value: "prefer_not_to_say", secondary: true },
];

function mountField(modelValue: unknown = null) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const wrapper = mount(ChoiceChipsField, {
    props: { label: "Sex", items: ITEMS, modelValue },
    global: { plugins: [vuetify, i18n] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("ChoiceChipsField", () => {
  it("draws the common options as chips with their symbol, the secondary ones as links", () => {
    const w = mountField();
    const chips = w.findAll(".choice-chips-field__chip");
    expect(chips.map((c) => c.text())).toEqual(["♀ Female", "♂ Male"]);
    expect(w.findAll(".choice-chips-field__link").map((l) => l.text())).toEqual(["Other", "Prefer not to say"]);
    expect(w.find(".choice-chips-field__more").text()).toContain(en["app.formRenderer.choiceMore"]);
  });

  it("emits the option's value on tap — chip or link alike", async () => {
    const w = mountField();
    await w.findAll(".choice-chips-field__chip")[1].trigger("click");
    await w.findAll(".choice-chips-field__link")[0].trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["male"], ["other"]]);
  });

  it("marks the current value as the checked radio, including a secondary one", () => {
    const w = mountField("prefer_not_to_say");
    const checked = w.findAll("[role=radio][aria-checked=true]");
    expect(checked).toHaveLength(1);
    expect(checked[0].text()).toBe("Prefer not to say");
    expect(checked[0].classes()).toContain("is-selected");
  });
});
