import { describe, it, expect, vi, afterEach } from "vitest";
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
import PartnerDocumentDialog from "../components/partner/PartnerDocumentDialog.vue";

function jsonResponse(ok: boolean, body: unknown, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response;
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
  jurisdiction: "MX",
  licenseNumber: "1234567",
  practiceRole: "owner",
  documents: { agreementVersionId: "agr-1", dpaVersionId: "dpa-1", noticeVersionId: "not-1" },
};

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";

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

function finishButton(wrapper: VueWrapper) {
  return wrapper.findAll("button").find((b) => b.text() === en["user.partnerRegistration.form.finish"])!;
}

async function signAndAcknowledge(wrapper: VueWrapper) {
  const dialog = wrapper.findComponent(PartnerDocumentDialog);
  dialog.vm.$emit("signed", { signatureDataUrl: SIGNATURE, versionIds: ["agr-1", "dpa-1"] });
  dialog.vm.$emit("acknowledged", { versionIds: ["not-1"] });
  await flushPromises();
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

  it("shows the registration form pre-filled from the invite, including the licence number", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();

    expect(wrapper.text()).toContain(en["user.partnerRegistration.subtitle"]);
    expect(wrapper.text()).toContain(VALID_PREVIEW.clinicName);
    expect(wrapper.text()).toContain(VALID_PREVIEW.taxId);
    expect(wrapper.text()).toContain(VALID_PREVIEW.licenseNumber);
    expect(wrapper.text()).toContain(en["app.identity.form.cedula"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.practiceRoleOwner"]);
  });
});

describe("PartnerRegistrationView — documents instead of checkboxes (NEO-51)", () => {
  it("renders the agreement and the privacy notice as document rows, with no checkboxes", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.agreementTitle"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.noticeTitle"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.statusToSign"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.statusToRead"]);
  });

  it("makes Edit details an outlined button, not a flat text link", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    const edit = wrapper.findAll("button").find((b) => b.text().includes(en["user.partnerRegistration.form.editDetails"]))!;
    expect(edit.classes()).toContain("v-btn--variant-outlined");
  });

  it("keeps Finish disabled until the agreement is signed and the notice read", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();

    expect(finishButton(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.finishHintBoth"]);

    const dialog = wrapper.findComponent(PartnerDocumentDialog);
    dialog.vm.$emit("signed", { signatureDataUrl: SIGNATURE, versionIds: ["agr-1", "dpa-1"] });
    await flushPromises();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.finishHintNotice"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.statusSigned"]);

    dialog.vm.$emit("acknowledged", { versionIds: ["not-1"] });
    await flushPromises();
    expect(finishButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("keeps Finish disabled while the licence number on file is invalid", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { ...VALID_PREVIEW, licenseNumber: "12" }));
    const { wrapper } = await mountPartnerRegistrationView();
    await signAndAcknowledge(wrapper);
    expect(finishButton(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.finishHintDetails"]);
  });

  it("submits the signature, the version ids read, the licence number and the role", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    await signAndAcknowledge(wrapper);

    const passwords = wrapper.findAll('input[type="password"]');
    await passwords[0]!.setValue("correct-horse-battery");
    await passwords[1]!.setValue("correct-horse-battery");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { success: true, email: VALID_PREVIEW.email }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const [url, init] = apiFetch.mock.calls.at(-1)! as [string, { body: string }];
    expect(url).toBe("/api/v1/invite/accept");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      token: "good-token",
      licenseNumber: "1234567",
      practiceRole: "owner",
      agreementSignatureDataUrl: SIGNATURE,
      agreementVersionId: "agr-1",
      dpaVersionId: "dpa-1",
      noticeVersionId: "not-1",
      noticeAcknowledged: true,
    });
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.goToLogin"]);
    expect(wrapper.text()).toContain(VALID_PREVIEW.email);
  });

  it("asks the doctor to read and sign again when a document was updated meanwhile (409 stale)", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    await signAndAcknowledge(wrapper);

    const passwords = wrapper.findAll('input[type="password"]');
    await passwords[0]!.setValue("correct-horse-battery");
    await passwords[1]!.setValue("correct-horse-battery");
    apiFetch.mockResolvedValueOnce(jsonResponse(false, { code: "DOCUMENT_VERSION_STALE" }, 409));
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.errorStale"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.statusToSign"]);
    expect(finishButton(wrapper).attributes("disabled")).toBeDefined();
  });
});
