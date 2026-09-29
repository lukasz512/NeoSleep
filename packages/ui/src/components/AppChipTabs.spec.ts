import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AppChipTabs from "./AppChipTabs.vue";

const OPTIONS = [
  { value: "details", label: "Details" },
  { value: "notes", label: "Notes" },
  { value: "studies", label: "Studies" },
  { value: "history", label: "History" },
];

function mountChips(modelValue = "notes") {
  return mount(AppChipTabs, { props: { modelValue, options: OPTIONS }, attachTo: document.body });
}

// NEO-61 phone tab pattern A: one chip per section, labels never ellipsized.
describe("AppChipTabs", () => {
  it("renders every label in full as a tab, the active one selected and focusable", () => {
    const wrapper = mountChips();
    const chips = wrapper.findAll('[role="tab"]');
    expect(chips.map((c) => c.text())).toEqual(["Details", "Notes", "Studies", "History"]);
    expect(chips[1].attributes("aria-selected")).toBe("true");
    expect(chips[1].attributes("tabindex")).toBe("0");
    expect(chips[0].attributes("tabindex")).toBe("-1");
    wrapper.unmount();
  });

  it("emits the clicked section", async () => {
    const wrapper = mountChips();
    await wrapper.findAll('[role="tab"]')[2].trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["studies"]);
    wrapper.unmount();
  });

  it("follows the WAI-ARIA tabs keyboard model (arrows, Home, End)", async () => {
    const wrapper = mountChips();
    const chips = wrapper.findAll('[role="tab"]');
    await chips[1].trigger("keydown", { key: "ArrowRight" });
    await chips[1].trigger("keydown", { key: "ArrowLeft" });
    await chips[1].trigger("keydown", { key: "End" });
    await chips[1].trigger("keydown", { key: "Home" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["studies"], ["details"], ["history"], ["details"]]);
    wrapper.unmount();
  });

  it("does not emit when an arrow key is already at the end", async () => {
    const wrapper = mountChips("history");
    await wrapper.findAll('[role="tab"]')[3].trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });
});
