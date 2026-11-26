import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia, setActivePinia } from "pinia";
import en from "@i18n/en.json";
import AddonCard from "./AddonCard.vue";

/**
 * NEO-225 (Łukasz D2): an order add-on (Morning Aligner) is a card with its
 * photo and a switch; tapping the photo opens it large with the full text.
 */

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountCard(modelValue = false) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  // The lightbox's close button (AppButton) reads the global loader store.
  setActivePinia(createPinia());
  const wrapper = mount(AddonCard, {
    props: {
      modelValue,
      title: "Morning Aligner",
      description: "Short text",
      details: "Full OA description",
      image: "ma.jpg",
      "onUpdate:modelValue": (v: boolean) => wrapper.setProps({ modelValue: v }),
    },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("AddonCard", () => {
  it("clicking anywhere on the card toggles it; the 'added' chip shows only when on", async () => {
    const wrapper = mountCard();
    expect(wrapper.find('[data-testid="addon-added"]').exists()).toBe(false);
    await wrapper.find('[data-testid="addon-card"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[true]]);
    expect(wrapper.find('[data-testid="addon-added"]').text()).toBe(en["app.deviceOrder.addon.added"]);
    expect(wrapper.find('[data-testid="addon-card"]').classes()).toContain("addon-card--on");
  });

  it("the switch toggles once (no double toggle from the card)", async () => {
    const wrapper = mountCard();
    wrapper.find<HTMLInputElement>('[data-testid="addon-switch"] input').element.click();
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toEqual([[true]]);
  });

  it("tapping the photo opens it large with the full description and does not toggle", async () => {
    const wrapper = mountCard();
    await wrapper.find('[data-testid="addon-photo"]').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    const dialog = document.querySelector('[data-testid="addon-lightbox"]');
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe("ma.jpg");
    expect(dialog?.textContent).toContain("Full OA description");
  });
});
