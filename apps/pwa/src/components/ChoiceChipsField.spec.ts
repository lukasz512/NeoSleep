import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
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
  document.body.innerHTML = "";
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
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("ChoiceChipsField", () => {
  it("one row: the common options as chips with their symbol, the rest behind a 'more' button — no visible label", () => {
    const w = mountField();
    expect(w.findAll(".choice-chips-field__chip").map((c) => c.text())).toEqual(["♀Female", "♂Male"]);
    expect(w.find(".choice-chips-field__more").attributes("aria-label")).toBe(en["app.formRenderer.choiceMore"]);
    expect(w.find("[role=radiogroup]").attributes("aria-label")).toBe("Sex");
    expect(w.text()).not.toContain("Sex");
  });

  it("emits the option's value on tap — a chip, or an item from the 'more' menu", async () => {
    const w = mountField();
    await w.findAll(".choice-chips-field__chip")[1].trigger("click");
    await w.find(".choice-chips-field__more").trigger("click");
    await nextTick();
    const item = [...document.querySelectorAll(".choice-chips-field__menu .v-list-item")]
      .find((el) => el.textContent?.includes("Other")) as HTMLElement;
    item.click();
    expect(w.emitted("update:modelValue")).toEqual([["male"], ["other"]]);
  });

  it("a picked secondary option replaces the 'more' button as the checked chip, the others shrink to their symbol", () => {
    const w = mountField("prefer_not_to_say");
    expect(w.find(".choice-chips-field__more").exists()).toBe(false);
    const checked = w.findAll("[role=radio][aria-checked=true]");
    expect(checked).toHaveLength(1);
    expect(checked[0].text()).toBe("Prefer not to say");
    expect(w.find(".choice-chips-field__row").classes()).toContain("has-secondary-value");
  });
});
