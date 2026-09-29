import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import AppSegmentedTabs from "./AppSegmentedTabs.vue";

const OPTIONS = [
  { value: "details", label: "Details" },
  { value: "documents", label: "Documents" },
  { value: "history", label: "Historia endo" },
];

function mountTabs(props: { fit?: boolean; underline?: boolean; modelValue?: string } = {}) {
  return mount(AppSegmentedTabs, {
    props: { modelValue: props.modelValue ?? "details", options: OPTIONS, fit: props.fit, underline: props.underline },
    global: { plugins: [createVuetify({ components: vuetifyComponents })] },
  });
}

describe("AppSegmentedTabs", () => {
  it("fills the row with equal columns by default", () => {
    const wrapper = mountTabs();
    expect(wrapper.classes()).not.toContain("app-segmented-tabs--fit");
    for (const tab of wrapper.findAll(".app-segmented-tabs__tab")) {
      expect(tab.classes()).toContain("flex-grow-1");
    }
  });

  // NEO-61: detail views on tablet/desktop — labels at their own width, never
  // stretched into equal slots that ellipsize "Documents" / "Historia endo".
  it("fit: tabs take their label's width and the bar hugs them", () => {
    const wrapper = mountTabs({ fit: true });
    expect(wrapper.classes()).toContain("app-segmented-tabs--fit");
    for (const tab of wrapper.findAll(".app-segmented-tabs__tab")) {
      expect(tab.classes()).not.toContain("flex-grow-1");
    }
  });

  // NEO-153: detail views use a flat row with a sliding underline, not the glass pill.
  it("underline: flat row with a bar thumb instead of the glass pill", () => {
    const wrapper = mountTabs({ fit: true, underline: true });
    expect(wrapper.classes()).toContain("app-segmented-tabs--underline");
    expect(wrapper.classes()).not.toContain("rounded-pill");
    expect(wrapper.find(".app-segmented-tabs__thumb").classes()).not.toContain("rounded-pill");
  });

  it("pill stays the default look", () => {
    const wrapper = mountTabs();
    expect(wrapper.classes()).toContain("rounded-pill");
    expect(wrapper.classes()).not.toContain("app-segmented-tabs--underline");
  });

  it("marks the active tab and emits the clicked one", async () => {
    const wrapper = mountTabs({ modelValue: "documents", fit: true });
    const tabs = wrapper.findAll(".app-segmented-tabs__tab");
    expect(tabs[1].attributes("aria-selected")).toBe("true");
    await tabs[2].trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["history"]);
  });
});
