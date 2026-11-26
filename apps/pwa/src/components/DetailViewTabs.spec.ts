import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, onMounted } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import DetailViewTabs from "./DetailViewTabs.vue";

const TABS = [
  { value: "details", labelKey: "app.patients.detail.tabs.details" },
  { value: "notes", labelKey: "app.patients.detail.tabs.notes" },
];

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountTabs(mounts: string[]) {
  const Probe = (name: string) =>
    defineComponent({
      setup() {
        onMounted(() => mounts.push(name));
        return () => h("p", { class: `probe-${name}` }, name);
      },
    });
  const DetailsProbe = Probe("details");
  const NotesProbe = Probe("notes");
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(DetailViewTabs, {
    props: { modelValue: "details", tabs: TABS },
    slots: { details: () => h(DetailsProbe), notes: () => h(NotesProbe) },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("DetailViewTabs (NEO-153)", () => {
  it("mounts only the active tab until another tab is opened", () => {
    const mounts: string[] = [];
    const wrapper = mountTabs(mounts);
    expect(mounts).toEqual(["details"]);
    expect(wrapper.find(".probe-notes").exists()).toBe(false);
  });

  it("keeps a visited tab mounted, so switching back never remounts it", async () => {
    const mounts: string[] = [];
    const wrapper = mountTabs(mounts);
    await wrapper.setProps({ modelValue: "notes" });
    await wrapper.setProps({ modelValue: "details" });
    await wrapper.setProps({ modelValue: "notes" });
    expect(mounts).toEqual(["details", "notes"]);
    expect(wrapper.find(".probe-notes").exists()).toBe(true);
  });

  it("hides the inactive pane", async () => {
    const wrapper = mountTabs([]);
    await wrapper.setProps({ modelValue: "notes" });
    const panes = wrapper.findAll(".detail-view-tabs__pane");
    const visible = panes.filter((p) => (p.element as HTMLElement).style.display !== "none");
    expect(visible).toHaveLength(1);
    expect(visible[0]!.find(".probe-notes").exists()).toBe(true);
  });
});
