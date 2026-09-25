import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import PartnerDocumentDialog from "./PartnerDocumentDialog.vue";

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";
const PREVIEW = {
  html: "<html><body><div class=\"signatures\"><div data-image=\"signer_signature\"></div></div></body></html>",
  dataFields: {},
  imageFields: {},
  versionIds: ["agr-1", "dpa-1"],
  versionLabel: "1.1",
};

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
  document.body.innerHTML = "";
});

async function mountDialog(props: Record<string, unknown>) {
  setActivePinia(createPinia());
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => PREVIEW } as Response);
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PartnerDocumentDialog, {
    props: {
      modelValue: true,
      kind: "agreement",
      token: "t",
      title: "Agreement",
      party: {},
      variant: "owner",
      jurisdiction: "MX",
      ...props,
    },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
}

describe("PartnerDocumentDialog — agreement already signed (NEO-51 review)", () => {
  it("opens on the signed preview with Change my signature + Done, not the pad", async () => {
    await mountDialog({ signature: SIGNATURE });
    expect(document.body.textContent).toContain(en["user.partnerRegistration.dialog.signedHeading"]);
    expect(buttonByText(en["user.partnerRegistration.dialog.changeSignature"])).toBeDefined();
    expect(buttonByText(en["user.partnerRegistration.dialog.done"])).toBeDefined();
    expect(document.querySelector(".signature-pad")).toBeNull();
  });

  it("Change my signature shows the pad; Keep current signature returns to the signed preview", async () => {
    const wrapper = await mountDialog({ signature: SIGNATURE });
    buttonByText(en["user.partnerRegistration.dialog.changeSignature"])!.click();
    await flushPromises();
    expect(document.querySelector(".signature-pad")).not.toBeNull();
    buttonByText(en["user.partnerRegistration.dialog.keepSignature"])!.click();
    await flushPromises();
    expect(document.querySelector(".signature-pad")).toBeNull();
    expect(wrapper.emitted("signed")).toBeUndefined();
  });

  it("an unsigned agreement opens on the pad", async () => {
    await mountDialog({ signature: null });
    expect(document.querySelector(".signature-pad")).not.toBeNull();
    expect(buttonByText(en["user.partnerRegistration.dialog.sign"])).toBeDefined();
  });
});

describe("PartnerDocumentDialog — privacy notice", () => {
  it("stays readable after acknowledging, with Done instead of I have read it", async () => {
    await mountDialog({ kind: "notice", acknowledged: true });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("type=notice"), expect.anything());
    expect(buttonByText(en["user.partnerRegistration.dialog.done"])).toBeDefined();
    expect(buttonByText(en["user.partnerRegistration.dialog.acknowledge"])).toBeUndefined();
  });
});
