import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToggleTileField from "./ToggleTileField.vue";

const base = { label: "Uses CPAP", onText: "Yes", offText: "No", trueValue: "CPAP", falseValue: "" };

describe("ToggleTileField (NEO-241)", () => {
  it.each(["", null])("off (%j) reads as off and turns on with one tap", async (modelValue) => {
    const w = mount(ToggleTileField, { props: { ...base, modelValue } });
    expect(w.attributes("aria-checked")).toBe("false");
    expect(w.text()).toContain("No");
    await w.trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["CPAP"]]);
  });

  it("on turns back off to the false value", async () => {
    const w = mount(ToggleTileField, { props: { ...base, modelValue: "CPAP" } });
    expect(w.attributes("aria-checked")).toBe("true");
    await w.trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([[""]]);
  });
});
