import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";

const apiFetch = vi.fn(async () => new Response("{}", { status: 200 }));
vi.mock("../../composables/useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...(args as [])) }));

import AdvanceLevelField from "./AdvanceLevelField.vue";
import NumberStepperField from "../NumberStepperField.vue";

function mountField(level: number | null) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  return mount(AdvanceLevelField, { props: { planId: "p-1", level }, global: { plugins: [vuetify, i18n] } });
}

describe("AdvanceLevelField (D4: advance level set at a control visit)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetch.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("saves the settled value once, on its own endpoint", async () => {
    const w = mountField(1);
    const stepper = w.findComponent(NumberStepperField);
    stepper.vm.$emit("update:modelValue", "2");
    stepper.vm.$emit("update:modelValue", "3");
    await vi.advanceTimersByTimeAsync(700);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/treatment-plan/p-1/advance-level",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ advance_level: 3 }) }),
    );
    expect(w.emitted("saved")).toEqual([[3]]);
  });

  it("ignores values outside 1–10 and does not save an unchanged level", async () => {
    const w = mountField(2);
    const stepper = w.findComponent(NumberStepperField);
    stepper.vm.$emit("update:modelValue", "11");
    stepper.vm.$emit("update:modelValue", "2");
    await vi.advanceTimersByTimeAsync(700);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
