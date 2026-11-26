import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import NumberStepperField from "./NumberStepperField.vue";

function mountStepper(props: Record<string, unknown>) {
  return mount(NumberStepperField, {
    props: { min: 100, max: 230, start: 165, label: "Talla", ...props },
    global: {
      plugins: [createVuetify({ components: vuetifyComponents }), createI18n({ legacy: false, locale: "en", messages: { en } })],
    },
  });
}

function buttons(w: ReturnType<typeof mountStepper>) {
  return w.findAll("button.number-stepper__btn");
}

/** A keyboard activation: a click with detail 0 (a pointer press steps on pointerdown instead). */
async function press(w: ReturnType<typeof mountStepper>, index: 0 | 1) {
  await buttons(w)[index]!.trigger("click");
}

describe("NumberStepperField (NEO-241)", () => {
  it("− and + move one step from the current value", async () => {
    const w = mountStepper({ modelValue: 170 });
    await press(w, 1);
    await press(w, 0);
    expect(w.emitted("update:modelValue")).toEqual([[171], [169]]);
  });

  it("the first press on an empty field lands on start", async () => {
    const w = mountStepper({ modelValue: "" });
    await press(w, 1);
    expect(w.emitted("update:modelValue")).toEqual([[165]]);
  });

  it("stops at min and max: the button is disabled there", () => {
    expect(buttons(mountStepper({ modelValue: 100 }))[0]!.attributes("disabled")).toBeDefined();
    expect(buttons(mountStepper({ modelValue: 230 }))[1]!.attributes("disabled")).toBeDefined();
  });

  it("a pointer press steps once (the click that follows doesn't step again)", async () => {
    const w = mountStepper({ modelValue: 170 });
    const plus = buttons(w)[1]!;
    await plus.trigger("pointerdown", { button: 0 });
    plus.element.dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true }));
    window.dispatchEvent(new Event("pointerup"));
    expect(w.emitted("update:modelValue")).toEqual([[171]]);
  });
});
