import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import AppSegmentedTabs from "./AppSegmentedTabs.vue";
import AppSegmentedTabsSource from "./AppSegmentedTabs.vue?raw";

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

  // CORE-179: jsdom has no cascade, so pin the rule itself — the shared thumb rule
  // paints it surface-colored (CORE-135), which hid the bar and left no tab looking selected.
  it("underline: the bar and the active label are primary-colored", () => {
    const rules = AppSegmentedTabsSource.replace(/\s+/g, " ");
    expect(rules).toMatch(/\.app-segmented-tabs--underline \.app-segmented-tabs__thumb \{[^}]*background: rgb\(var\(--v-theme-primary\)\)/);
    expect(rules).toMatch(/\.app-segmented-tabs--underline \.app-segmented-tabs__tab--active \{[^}]*color: rgb\(var\(--v-theme-primary\)\)/);
  });

  // CORE-135: one look for every switcher — the calendar's grey track with a light sliding thumb, not the teal pill.
  it("the default look is the calendar's track with a light thumb", () => {
    const wrapper = mountTabs();
    expect(wrapper.classes()).toContain("app-segmented-tabs--track");
    expect(wrapper.classes()).not.toContain("rounded-pill");
    expect(wrapper.find(".app-segmented-tabs__thumb").classes()).not.toContain("bg-primary");
    expect(wrapper.classes()).not.toContain("app-segmented-tabs--underline");
  });

  // CORE-135: Historia clínica tabs carry a status icon, a "New" chip and their own ids.
  it("a tab slot renders custom content and option attrs land on the tab", () => {
    const wrapper = mount(AppSegmentedTabs, {
      props: { modelValue: "a", options: [{ value: "a", label: "A", attrs: { id: "tab-a", "data-section": "a" } }, { value: "b", label: "B" }] },
      slots: { tab: `<template #tab="{ option, active }"><i class="mark">{{ option.label }}{{ active ? "*" : "" }}</i></template>` },
      global: { plugins: [createVuetify({ components: vuetifyComponents })] },
    });
    const tabs = wrapper.findAll(".app-segmented-tabs__tab");
    expect(tabs[0].attributes("id")).toBe("tab-a");
    expect(tabs[0].attributes("data-section")).toBe("a");
    expect(tabs.map((t) => t.find(".mark").text())).toEqual(["A*", "B"]);
  });

  it("arrow keys move the selection like a native segmented control", async () => {
    const wrapper = mountTabs({ modelValue: "documents" });
    const tabs = wrapper.findAll(".app-segmented-tabs__tab");
    await tabs[1].trigger("keydown", { key: "ArrowRight" });
    await tabs[1].trigger("keydown", { key: "ArrowLeft" });
    await tabs[0].trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["history"], ["details"], ["history"]]);
    expect(tabs[0].attributes("tabindex")).toBe("-1");
    expect(tabs[1].attributes("tabindex")).toBe("0");
  });

  it("marks the active tab and emits the clicked one", async () => {
    const wrapper = mountTabs({ modelValue: "documents", fit: true });
    const tabs = wrapper.findAll(".app-segmented-tabs__tab");
    expect(tabs[1].attributes("aria-selected")).toBe("true");
    await tabs[2].trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["history"]);
  });
});
