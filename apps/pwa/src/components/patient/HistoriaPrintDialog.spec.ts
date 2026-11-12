import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import HistoriaPrintDialog from "./HistoriaPrintDialog.vue";

/** NEO-260 D7: before the Historia clínica PDF is generated, the dialog asks what goes in it. */
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = "";
});

async function open(props: { canSign: boolean; consentSignedOn: string | null }) {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(HistoriaPrintDialog, { props: { modelValue: true, ...props }, attachTo: document.body, global: { plugins: [i18n, vuetify] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const consentBox = () => q('[data-testid="print-consent"] input') as HTMLInputElement;

describe("HistoriaPrintDialog (NEO-260)", () => {
  it("an unsigned consent is picked by default, to sign on paper", async () => {
    await open({ canSign: false, consentSignedOn: null });
    expect(consentBox().checked).toBe(true);
    expect(q('[data-testid="print-consent"]')!.textContent).toContain("Not signed yet");
  });

  it("a signed consent is left out by default and, when picked, prints as a copy", async () => {
    const wrapper = await open({ canSign: false, consentSignedOn: "05/10/2026" });
    expect(consentBox().checked).toBe(false);
    expect(q('[data-testid="print-consent"]')!.textContent).toContain("Signed on 05/10/2026");
    expect(q('[data-testid="print-consent"]')!.textContent).toContain("copy");

    consentBox().click();
    await flushPromises();
    (q('[data-testid="print-go"]') as HTMLButtonElement).click();
    expect(wrapper.emitted("print")?.[0]).toEqual([{ consent: true, signature: null }]);
  });

  it("only a doctor gets the signature pad; anyone else prints straight away", async () => {
    const other = await open({ canSign: false, consentSignedOn: null });
    expect(q('[data-testid="doctor-signature-field"]')).toBeNull();
    (q('[data-testid="print-go"]') as HTMLButtonElement).click();
    expect(other.emitted("print")?.[0]).toEqual([{ consent: true, signature: null }]);
    other.unmount();
    document.body.innerHTML = "";

    const doctor = await open({ canSign: true, consentSignedOn: null });
    expect(q('[data-testid="doctor-signature-field"]')).not.toBeNull();
    (q('[data-testid="doctor-signature-skip"]') as HTMLButtonElement).click(); // "Print unsigned"
    expect(doctor.emitted("print")?.[0]).toEqual([{ consent: true, signature: null }]);
  });
});
