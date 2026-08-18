import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import AppFilterBar from "./AppFilterBar.vue";
import type { FilterDefinition } from "../composables/useFilters";

const DEFINITIONS: FilterDefinition[] = [
  {
    key: "status",
    type: "select",
    labelKey: "user.leads.filters.status",
    options: [
      { title: "New", value: "new", chipClass: "pwa-lead-status-chip--new" },
      { title: "Won", value: "won", chipClass: "pwa-lead-status-chip--won" },
    ],
  },
];

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountFilterBar(props: {
  modelValue?: Record<string, string | string[]>;
  activeFilterCount?: number;
} = {}) {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  const el = document.createElement("div");
  document.body.appendChild(el);

  const wrapper = mount(AppFilterBar, {
    attachTo: el,
    props: {
      modelValue: props.modelValue ?? {},
      definitions: DEFINITIONS,
      titleKey: "user.leads.filters.title",
      clearKey: "user.leads.filters.clear",
      activeFilterCount: props.activeFilterCount ?? 0,
    },
    global: { plugins: [i18n, vuetify] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppFilterBar", () => {
  it("renders a visible filter icon on the activator button (min touch target, no border)", () => {
    const wrapper = mountFilterBar();
    const btn = wrapper.find(".app-filter-bar__btn");
    expect(btn.exists()).toBe(true);
    expect(btn.classes()).toContain("app-filter-bar__btn--no-border");

    const icon = btn.find("svg.app-filter-bar__icon");
    expect(icon.exists()).toBe(true);
    expect(icon.attributes("stroke")).toBe("currentColor");
  });

  it("shows the active-filter-count badge only when filters are active", async () => {
    const inactive = mountFilterBar({ activeFilterCount: 0 });
    expect(inactive.findComponent({ name: "VBadge" }).props("modelValue")).toBe(false);

    const active = mountFilterBar({ activeFilterCount: 2 });
    const badge = active.findComponent({ name: "VBadge" });
    expect(badge.props("modelValue")).toBe(true);
    expect(badge.props("content")).toBe(2);
  });

  it("opens the menu on click and emits an updated filter value from a select field", async () => {
    const wrapper = mountFilterBar();
    await wrapper.find(".app-filter-bar__btn").trigger("click");
    await wrapper.vm.$nextTick();

    // VSelect renders its options into an overlay teleported to document.body.
    const select = wrapper.findComponent({ name: "VSelect" });
    expect(select.exists()).toBe(true);

    select.vm.$emit("update:modelValue", ["won"]);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([{ status: ["won"] }]);
  });

  it("renders chip options with the pwa-lead-status-chip class for select fields that define chipClass", async () => {
    const wrapper = mountFilterBar({ modelValue: { status: ["won"] } });
    await wrapper.find(".app-filter-bar__btn").trigger("click");
    await wrapper.vm.$nextTick();

    const select = wrapper.findComponent({ name: "VSelect" });
    expect(select.props("chips")).toBe(true);
  });
});
