import { ApiError } from "@api";
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
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const VALID_PREVIEW = {
  email: "doctor@example.com",
  phone: "+52 55 9999 0000",
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

  // NEO-81: our own failure must never tell a doctor their invitation is invalid.
  it("a server error while validating says 'problem on our side' with a retry, not 'invalid link'", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, { error: "Internal server error" }, 500));
    const { wrapper } = await mountPartnerRegistrationView();
    expect(wrapper.text()).toContain(en["common.error.server.title"]);
    expect(wrapper.text()).not.toContain(en["user.partnerRegistration.invalidTitle"]);

    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    await wrapper.findAll("button").find((b) => b.text() === en["app.errorState.refresh"])!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain(en["common.error.server.title"]);
  });

  it("a dropped connection while validating says so, not 'invalid link'", async () => {
    apiFetch.mockRejectedValueOnce(new ApiError({ kind: "network", message: "Failed to fetch" }));
    const { wrapper } = await mountPartnerRegistrationView();
    expect(wrapper.text()).toContain(en["common.error.network.title"]);
    expect(wrapper.text()).not.toContain(en["user.partnerRegistration.invalidTitle"]);
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
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.status.agreement.notOpened"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.status.notice.notOpened"]);
  });

  it("shows a tile going from 'not opened' to 'opened' when the doctor opens it (NEO-51 review)", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    // The dialog fetches its preview on open — keep that pending so only the tile state is asserted.
    apiFetch.mockReturnValue(new Promise(() => {}));
    const readAndSign = wrapper.findAll("button").find((b) => b.text() === en["user.partnerRegistration.documents.readAndSign"])!;
    await readAndSign.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.status.agreement.opened"]);
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.status.notice.notOpened"]);
  });

  it("makes Edit details a filled (tonal) button with an icon, not a flat text link", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    const edit = wrapper.findAll("button").find((b) => b.text().includes(en["user.partnerRegistration.form.editDetails"]))!;
    expect(edit.classes()).toContain("v-btn--variant-tonal");
    expect(edit.find(".v-btn__prepend").exists()).toBe(true);
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
    expect(wrapper.text()).toContain(en["user.partnerRegistration.documents.status.agreement.done"]);

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

  it("after registering, says the account is active and moves on to login with the email pre-filled", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
      const { wrapper, router } = await mountPartnerRegistrationView();
      await signAndAcknowledge(wrapper);
      const passwords = wrapper.findAll('input[type="password"]');
      await passwords[0]!.setValue("correct-horse-battery");
      await passwords[1]!.setValue("correct-horse-battery");
      apiFetch.mockResolvedValueOnce(jsonResponse(true, { success: true, email: VALID_PREVIEW.email }));
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.text()).toContain(en["user.partnerRegistration.form.successTitle"]);
      expect(wrapper.text()).toContain("8 s");
      expect(router.currentRoute.value.path).toBe("/partner-register");

      vi.advanceTimersByTime(8000);
      // /login's view is a lazy chunk — the navigation settles once it has loaded.
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"), { timeout: 5000 });
      expect(router.currentRoute.value.query.email).toBe(VALID_PREVIEW.email);
    } finally {
      vi.useRealTimers();
    }
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
    expect(wrapper.text()).not.toContain(en["user.partnerRegistration.documents.status.agreement.done"]);
    expect(finishButton(wrapper).attributes("disabled")).toBeDefined();
  });
});

describe("PartnerRegistrationView — errors in the form, not as an alert (NEO-109)", () => {
  /** Some keys are proposed in the NEO-109 i18n batch — until they land, vue-i18n prints the key itself. */
  const msg = (key: string) => (en as Record<string, string>)[key] ?? key;

  async function readyToFinish(password = "correct-horse-battery") {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    await signAndAcknowledge(wrapper);
    const passwords = wrapper.findAll('input[type="password"]');
    await passwords[0]!.setValue(password);
    await passwords[1]!.setValue(password);
    return wrapper;
  }

  const summary = (wrapper: VueWrapper) => wrapper.find('[data-testid="form-error-summary"]');

  // jsdom has no scrollIntoView (a summary link scrolls its field into view).
  Element.prototype.scrollIntoView = vi.fn();

  it("shows no summary before the first submit", async () => {
    const wrapper = await readyToFinish();
    expect(summary(wrapper).exists()).toBe(false);
  });

  it("a password too short is listed in the summary on submit, and nothing is sent", async () => {
    const wrapper = await readyToFinish("short");
    const calls = apiFetch.mock.calls.length;
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(summary(wrapper).exists()).toBe(true);
    expect(summary(wrapper).text()).toContain(en["user.partnerRegistration.form.validation.passwordMin"]);
    expect(apiFetch.mock.calls.length).toBe(calls);
  });

  it("a practice detail the API rejects is marked on its row and in the summary — no red alert", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(
      jsonResponse(false, { error: "Clinic email is required", code: "VALIDATION_ERROR", field: "clinicEmail", reason: "required" }),
    );
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(summary(wrapper).text()).toContain(en["user.partnerRegistration.form.clinicEmail"]);
    expect(summary(wrapper).text()).toContain(en["app.formRenderer.validation.required"]);
    expect(wrapper.find('[data-field="clinicEmail"] [data-testid="clinic-detail-error"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(en["user.partnerRegistration.form.errorSubmit"]);
    // Still on the form — the doctor fixes it and submits again.
    expect(finishButton(wrapper).exists()).toBe(true);
  });

  it("the summary's line for a rejected detail opens the details dialog with that field marked, and changing it clears the mark", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(
      jsonResponse(false, { error: "Invalid cédula profesional", code: "VALIDATION_ERROR", field: "licenseNumber", reason: "invalid" }),
    );
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    await summary(wrapper).find("button").trigger("click");
    await flushPromises();
    // The dialog is teleported to <body> (the page itself isn't attached), so this is the dialog's own summary.
    const dialogSummary = document.querySelector('[data-testid="form-error-summary"]');
    expect(dialogSummary?.textContent).toContain(en["app.formRenderer.validation.server.licenseNumber"]);
    expect(document.activeElement?.getAttribute("inputmode")).toBe("numeric");

    // A new value for the rejected field → Save → the page no longer marks it.
    const license = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((i) => i.value === VALID_PREVIEW.licenseNumber)!;
    license.value = "7654321";
    license.dispatchEvent(new Event("input"));
    await flushPromises();
    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === en["user.partnerRegistration.form.editModal.save"],
    )!;
    save.click();
    await flushPromises();
    expect(wrapper.find('[data-field="licenseNumber"] [data-testid="clinic-detail-error"]').exists()).toBe(false);
    expect(summary(wrapper).exists()).toBe(false);
  });

  it("an expired / already-used link at submit is a line about the whole form", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(
      jsonResponse(false, { error: "Invalid or expired invitation link.", code: "VALIDATION_ERROR", field: "token", reason: "invalid" }),
    );
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(summary(wrapper).text()).toContain(msg("user.partnerRegistration.form.errorInvalidLink"));
    expect(summary(wrapper).find("button").exists()).toBe(false);
  });

  it("a stale document is said in the summary box", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(jsonResponse(false, { code: "DOCUMENT_VERSION_STALE" }, 409));
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(summary(wrapper).text()).toContain(en["user.partnerRegistration.form.errorStale"]);
  });

  it("a server failure stays the red alert — nothing in the form to fix", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(jsonResponse(false, { error: "boom" }, 500));
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.errorSubmit"]);
    expect(summary(wrapper).exists()).toBe(false);
  });
});


describe("PartnerRegistrationView — person and clinic are separate cards (NEO-270)", () => {
  Element.prototype.scrollIntoView = vi.fn();

  const person = (w: VueWrapper) => w.find('[data-testid="person-details"]');
  const clinic = (w: VueWrapper) => w.find('[data-testid="clinic-details"]');

  async function ready() {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, VALID_PREVIEW));
    const { wrapper } = await mountPartnerRegistrationView();
    return wrapper;
  }

  async function readyToFinish() {
    const wrapper = await ready();
    await signAndAcknowledge(wrapper);
    const passwords = wrapper.findAll('input[type="password"]');
    await passwords[0]!.setValue("correct-horse-battery");
    await passwords[1]!.setValue("correct-horse-battery");
    return wrapper;
  }

  /** Opens the person dialog, sets the input holding `from` to `to`, saves. */
  async function editPersonValue(wrapper: VueWrapper, from: string, to: string) {
    await person(wrapper).find('[data-testid="edit-person"]').trigger("click");
    await flushPromises();
    const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((i) => i.value === from)!;
    input.value = to;
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === en["user.partnerRegistration.form.editModal.save"],
    )!;
    save.click();
    await flushPromises();
  }

  it("shows the doctor's own data in 'Your details' and the practice data in the clinic card", async () => {
    const wrapper = await ready();
    const p = person(wrapper).text();
    expect(p).toContain(en["user.partnerRegistration.form.personDetailsHeading"]);
    for (const v of [VALID_PREVIEW.firstName, VALID_PREVIEW.lastName, VALID_PREVIEW.email, VALID_PREVIEW.phone, VALID_PREVIEW.licenseNumber]) {
      expect(p).toContain(v);
    }
    const c = clinic(wrapper).text();
    expect(c).toContain(VALID_PREVIEW.clinicName);
    expect(c).toContain(VALID_PREVIEW.taxId);
    expect(c).not.toContain(VALID_PREVIEW.licenseNumber);
    expect(c).not.toContain(VALID_PREVIEW.phone);
  });

  it("keeps Finish disabled while the personal phone is empty", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { ...VALID_PREVIEW, phone: null }));
    const { wrapper } = await mountPartnerRegistrationView();
    await signAndAcknowledge(wrapper);
    expect(finishButton(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.finishHintDetails"]);
  });

  it("submits the doctor's name, email and phone", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { success: true, email: VALID_PREVIEW.email }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [, init] = apiFetch.mock.calls.at(-1)! as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({
      firstName: "Ana",
      lastName: "García",
      email: VALID_PREVIEW.email,
      phone: VALID_PREVIEW.phone,
    });
  });

  it("a changed email is what gets submitted, and it asks to sign again", async () => {
    const wrapper = await readyToFinish();
    expect(finishButton(wrapper).attributes("disabled")).toBeUndefined();
    await editPersonValue(wrapper, VALID_PREVIEW.email, "new.doctor@example.com");

    expect(person(wrapper).text()).toContain("new.doctor@example.com");
    expect(wrapper.text()).toContain(en["user.partnerRegistration.form.detailsChangedResign"]);
    expect(finishButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("changing only the phone does not force a new signature (it is not in the contract)", async () => {
    const wrapper = await readyToFinish();
    await editPersonValue(wrapper, VALID_PREVIEW.phone, "+52 55 1111 2222");
    expect(person(wrapper).text()).toContain("+52 55 1111 2222");
    expect(wrapper.text()).not.toContain(en["user.partnerRegistration.form.detailsChangedResign"]);
    expect(finishButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("an email already in use is marked on the email row, with no red alert", async () => {
    const wrapper = await readyToFinish();
    apiFetch.mockResolvedValueOnce(
      jsonResponse(false, { error: "Email already in use", code: "EMAIL_IN_USE", field: "email" }, 409),
    );
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(person(wrapper).find('[data-field="email"] [data-testid="clinic-detail-error"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(en["user.partnerRegistration.form.errorSubmit"]);
  });

  it("the login redirect uses the email the API confirms (the changed one)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const wrapper = await readyToFinish();
      apiFetch.mockResolvedValueOnce(jsonResponse(true, { success: true, email: "new.doctor@example.com" }));
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(wrapper.text()).toContain("new.doctor@example.com");
    } finally {
      vi.useRealTimers();
    }
  });
});
