import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import { routes } from "../router/routes";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import PartnerRegistrationView from "./PartnerRegistrationView.vue";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const VALID_PREVIEW = {
  email: "doctor@example.com",
  firstName: "Ana",
  lastName: "García",
  clinicName: "Clínica Sonrisa",
  clinicEmail: "clinica@example.com",
  clinicPhone: "+52 55 1234 5678",
  clinicAddress: "Av. Reforma 123",
  taxId: "RFC123456ABC",
};

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountPartnerRegistrationView(
  path = "/partner-register?token=good-token",
): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();

  const wrapper = mount(PartnerRegistrationView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

/**
 * VCheckbox only renders its `color` prop's `text-<color>` class on the
 * `.v-selection-control__wrapper` element once checked (Vuetify's
 * VSelectionControl: textColorClasses is `model.value ? props.color :
 * props.baseColor`) — an unchecked box carries no color class either way,
 * so this must check first to actually exercise the prop.
 */
async function checkboxColorClasses(wrapper: VueWrapper, checkboxIndex: number): Promise<string[]> {
  const checkboxInput = wrapper.findAll('input[type="checkbox"]')[checkboxIndex]!;
  await checkboxInput.setValue(true);
  const wrapperEl = checkboxInput.element.closest(".v-selection-control")!.querySelector(".v-selection-control__wrapper")!;
  return Array.from(wrapperEl.classList);
}

describe("PartnerRegistrationView — invite validation", () => {
  it("shows the invalid-link message when there is no token", async () => {
    const { wrapper } = await mountPartnerRegistrationView("/partner-register");
    expect(wrapper.text()).toContain(en["user.partnerRegistration.invalidTitle"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.invalidBody"]);
  });

  it("shows the invalid-link message when the token fails to validate", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, {}));
    const { wrapper } = await mountPartnerRegistrationView();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.invalidTitle"]);
  });

  it("shows the registration form pre-filled from the invite preview on a valid token", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();

    expect(wrapper.text()).toContain(en["user.partnerRegistration.subtitle"]);
    expect(wrapper.text()).toContain(VALID_PREVIEW.clinicName);
    expect(wrapper.text()).toContain(VALID_PREVIEW.taxId);
  });
});

describe("PartnerRegistrationView — checkbox styling (NEO-11)", () => {
  beforeEach(() => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
  });

  it("renders exactly the GDPR and partner-agreement checkboxes, one consistent input type", async () => {
    const { wrapper } = await mountPartnerRegistrationView();

    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.gdprLabel"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.agreementLabel"]);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it("renders the GDPR checkbox in the app's primary brand color, not Vuetify's unthemed default", async () => {
    const { wrapper } = await mountPartnerRegistrationView();
    expect(await checkboxColorClasses(wrapper, 0)).toContain("text-primary");
  });

  it("renders the partner-agreement checkbox in the app's primary brand color, not Vuetify's unthemed default", async () => {
    const { wrapper } = await mountPartnerRegistrationView();
    expect(await checkboxColorClasses(wrapper, 1)).toContain("text-primary");
  });
});
