import { describe, it, expect, afterEach } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import InviteEmailDialog from "./InviteEmailDialog.vue";
import EmailLanguageSelect from "../questionnaire/EmailLanguageSelect.vue";

/** NEO-272: resending a doctor's invite offers the same language picker, preselected from the doctor. */
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function mountDialog(props: Record<string, unknown> = {}) {
  const w = mount(InviteEmailDialog, {
    props: { modelValue: true, language: "pl", sending: false, ...props },
    global: {
      plugins: [
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        createI18n({ legacy: false, locale: "en", messages: { en } }),
        createPinia(),
      ],
    },
    attachTo: document.body,
  });
  mounted.push(w);
  await nextTick();
  await nextTick();
  return w;
}

describe("InviteEmailDialog (NEO-272)", () => {
  it("preselects the doctor's language in the header flag", async () => {
    const w = await mountDialog({ language: "pl" });
    expect(w.findComponent(EmailLanguageSelect).props("modelValue")).toBe("pl");
    expect(document.querySelector("[data-testid=email-language]")!.closest("[data-testid=invite-email-header-slot]")).not.toBeNull();
  });

  it("sends the doctor's language by default and the picked one when changed", async () => {
    const w = await mountDialog({ language: "pl" });
    (document.querySelector("[data-testid=invite-email-send]") as HTMLElement).click();
    w.findComponent(EmailLanguageSelect).vm.$emit("update:modelValue", "en");
    await nextTick();
    (document.querySelector("[data-testid=invite-email-send]") as HTMLElement).click();
    expect(w.emitted("send")).toEqual([["pl"], ["en"]]);
  });

  it("starts from the doctor's language again on the next opening", async () => {
    const w = await mountDialog({ language: "mx" });
    w.findComponent(EmailLanguageSelect).vm.$emit("update:modelValue", "en");
    await w.setProps({ modelValue: false });
    await w.setProps({ modelValue: true });
    await nextTick();
    expect(w.findComponent(EmailLanguageSelect).props("modelValue")).toBe("mx");
  });
});
