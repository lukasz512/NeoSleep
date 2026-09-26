import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import en from "@i18n/en.json";

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";

// jsdom has no canvas — the pad is replaced by one exposing the same imperative API.
vi.mock("../SignaturePad.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: { clearPlacement: String, fill: Boolean },
      emits: ["change"],
      setup(props, { expose, emit }) {
        let signed = false;
        expose({
          isEmpty: () => !signed,
          toDataURL: () => (signed ? SIGNATURE : null),
          clear: () => { signed = false; emit("change", true); },
        });
        return () =>
          h("div", {
            class: "signature-pad-stub",
            "data-clear": props.clearPlacement,
            onClick: () => { signed = true; emit("change", false); },
          });
      },
    }),
  };
});

import ConsentSignatureField from "./ConsentSignatureField.vue";

const originalMatchMedia = window.matchMedia;
function setPhone(isPhone: boolean) {
  window.matchMedia = ((query: string) => ({ ...originalMatchMedia(query), matches: isPhone })) as typeof window.matchMedia;
}

const mounted: VueWrapper[] = [];
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  window.matchMedia = originalMatchMedia;
  document.body.innerHTML = "";
});

function mountField() {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents });
  const w = mount(ConsentSignatureField, { attachTo: document.body, global: { plugins: [i18n, vuetify] } });
  mounted.push(w);
  return w;
}

const sheet = () => document.body.querySelector<HTMLElement>(".consent-signature__sheet");
const buttonByText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);

describe("ConsentSignatureField", () => {
  it("on tablets/desktop keeps the inline pad with Clear inside it, away from the submit button", () => {
    setPhone(false);
    const w = mountField();
    expect(w.find(".signature-pad-stub").attributes("data-clear")).toBe("overlay");
    expect(w.find(".consent-signature__tap").exists()).toBe(false);
  });

  it("on a phone signs on a full-screen sheet: Clear on top, Use at the bottom, nothing accepted until Use", async () => {
    setPhone(true);
    const w = mountField();
    const vm = w.vm as unknown as { isEmpty: () => boolean; toDataURL: () => string | null };

    await w.find(".consent-signature__tap").trigger("click");
    await flushPromises();
    const el = sheet();
    expect(el).not.toBeNull();
    expect(el?.querySelector(".consent-signature__bar")?.textContent).toContain("Clear");
    expect(el?.querySelector(".consent-signature__footer")?.textContent).toContain("Use this signature");
    expect(buttonByText(el!, "Use this signature")?.disabled).toBe(true);

    el?.querySelector<HTMLElement>(".signature-pad-stub")?.click();
    await flushPromises();
    expect(vm.isEmpty()).toBe(true); // drawn but not accepted yet
    buttonByText(el!, "Use this signature")?.click();
    await flushPromises();

    expect(sheet()).toBeNull();
    expect(vm.isEmpty()).toBe(false);
    expect(vm.toDataURL()).toBe(SIGNATURE);
    expect(w.find(".consent-signature__preview").attributes("src")).toBe(SIGNATURE);
    expect(w.text()).toContain("Tap to sign again");
  });

  it("Cancel closes the sheet without accepting anything", async () => {
    setPhone(true);
    const w = mountField();
    await w.find(".consent-signature__tap").trigger("click");
    await flushPromises();
    sheet()?.querySelector<HTMLElement>(".signature-pad-stub")?.click();
    buttonByText(sheet()!, "Cancel")?.click();
    await flushPromises();
    expect(sheet()).toBeNull();
    expect((w.vm as unknown as { isEmpty: () => boolean }).isEmpty()).toBe(true);
  });

  it("asks for landscape where the browser supports it (Android), and releases it on close", async () => {
    setPhone(true);
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();
    Object.defineProperty(screen, "orientation", { configurable: true, value: { lock, unlock } });
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    HTMLElement.prototype.requestFullscreen = requestFullscreen;

    const w = mountField();
    await w.find(".consent-signature__tap").trigger("click");
    await flushPromises();
    expect(requestFullscreen).toHaveBeenCalled();
    expect(lock).toHaveBeenCalledWith("landscape");

    buttonByText(sheet()!, "Cancel")?.click();
    await flushPromises();
    expect(unlock).toHaveBeenCalled();
  });
});
