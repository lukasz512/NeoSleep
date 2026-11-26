import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import NoteComposer from "./NoteComposer.vue";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountComposer(modelValue: string) {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(NoteComposer, {
    props: { modelValue, placeholder: "Add a note…" },
    global: { plugins: [i18n, vuetify] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("NoteComposer (NEO-153)", () => {
  it("submits the draft on Ctrl+Enter", async () => {
    const wrapper = mountComposer("Follow-up in 3 months");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(wrapper.emitted("submit")).toEqual([["Follow-up in 3 months"]]);
  });

  it("does not submit on a plain Enter (new line)", async () => {
    const wrapper = mountComposer("Line one");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("does not submit a blank draft and disables the button", async () => {
    const wrapper = mountComposer("   ");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter", metaKey: true });
    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.find(".note-composer__submit").attributes("disabled")).toBeDefined();
  });

  it("shows the keyboard hint", () => {
    const wrapper = mountComposer("");
    expect(wrapper.find(".note-composer__hint").text()).toMatch(/Enter to add$/);
  });
});
