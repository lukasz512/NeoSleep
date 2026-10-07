import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
// The top bar loads the tenant's branding (public /config/app) on its own —
// answered here so the per-test mocks stay the questionnaire's calls only.
// The consent pad's "sign on your phone" QR (CORE-172) starts and polls on its
// own too — recorded in handoffFetch, kept out of the questionnaire's calls.
const handoffFetch = vi.fn((url: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("/pickup") ? { status: "pending" } : { handoffToken: "h", pickupToken: "p" }),
  })
);
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => {
    if (args[0] === "/api/v1/config/app") return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    if (typeof args[0] === "string" && /sign-handoff|signature-handoff/.test(args[0])) return handoffFetch(args[0]);
    return apiFetch(...args);
  },
}));

import PatientQuestionnaireView from "./PatientQuestionnaireView.vue";
import { useNotifications } from "../composables/useNotifications";

/** The inline alerts on screen (NEO-105) — validation lives in the form, never in a toast. */
const alerts = (wrapper: VueWrapper) => wrapper.findAll(".app-inline-alert").map((a) => a.text());
const toastCount = () => useNotifications().notifications.value.length;

const TOKEN = "a".repeat(43);
const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";

// jsdom has no canvas — the pad is replaced by one exposing the same imperative API.
let signed = false;
vi.mock("../components/SignaturePad.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      setup(_, { expose }) {
        expose({ isEmpty: () => !signed, toDataURL: () => SIGNATURE, clear: () => (signed = false) });
        return () => h("div", { class: "signature-pad-stub" });
      },
    }),
  };
});
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

const step = (key: string, type: string, over: Record<string, unknown> = {}) => ({ key, type, done: false, label: key, ...over });
const lookup = (steps: unknown[], over: Record<string, unknown> = {}) => ({
  patient_first_name: "Ana",
  clinic_name: null,
  clinic_email: null,
  privacy_notice_url: "https://neosleepcare.com/privacy",
  clinic_privacy_notice_url: "https://neosleepcare.com/privacy",
  steps,
  ...over,
});

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
  signed = false;
  useNotifications().notifications.value = [];
  localStorage.clear(); // unsent-answer drafts must not leak from one test into the next
});

async function mountView(): Promise<VueWrapper> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/q", component: PatientQuestionnaireView }],
  });
  await router.push(`/q#${TOKEN}`);
  await router.isReady();
  const wrapper = mount(PatientQuestionnaireView, { global: { plugins: [i18n, vuetify, router] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

/** Opens the consent document card and reads it to the end (jsdom: the text always fits, so it's read at once). */
async function readDocument(wrapper: VueWrapper) {
  await wrapper.find("[data-testid='consent-document-card']").trigger("click");
  await flushPromises();
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  const next = document.body.querySelector<HTMLButtonElement>("[data-testid='consent-reader-continue']")!;
  expect(next.disabled).toBe(false);
  next.click();
  await flushPromises();
}

const buttonWithText = (wrapper: VueWrapper, text: string) => wrapper.findAll("button").filter((b) => b.text() === text);

/** Card by card: answer the question on screen, then "Next" (the auto-advance timer then does nothing — the patient already moved on). */
async function answerCards(wrapper: VueWrapper, answer: "Yes" | "No", count: number) {
  for (let i = 0; i < count; i++) {
    await buttonWithText(wrapper, answer)[0]!.trigger("click");
    await buttonWithText(wrapper, "Next →")[0]!.trigger("click");
  }
  await flushPromises();
}

describe("PatientQuestionnaireView (public QR self-fill)", () => {
  it("shows the 'no longer valid' state for a used/expired/unknown link", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 410, { code: "LINK_INVALID" }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("This link is no longer valid");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("a temporary failure (e.g. 429, API cold start) is retryable — never reported as a dead link", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 503, { error: "unavailable" }));
    const wrapper = await mountView();
    expect(wrapper.text()).not.toContain("This link is no longer valid");
    expect(wrapper.text()).toContain("Something went wrong");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang")])));
    await wrapper.findAll("button").find((b) => b.text() !== "")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Hello, Ana");
  });

  it("greets by first name only and won't submit until every question is answered and consent given", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("medicalHistory", "medical_history")], { patient_first_name: "Lucía", clinic_name: "Clínica Sonrisa" })));
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Hello, Lucía");
    expect(wrapper.text()).toContain("Clínica Sonrisa asks you");
    // The medical history is one list (14 plain yes/no questions), not cards.
    expect(buttonWithText(wrapper, "No")).toHaveLength(14);

    // Send stays locked until every question is answered and consent is ticked; a tap says what's missing.
    const send = () => wrapper.find("button[type='submit']");
    expect(send().attributes("aria-disabled")).toBe("true");
    await wrapper.find("input[type='checkbox']").setValue(true);
    expect(send().attributes("aria-disabled")).toBe("true");
    await wrapper.find("form").trigger("submit");
    expect(alerts(wrapper)).toEqual(["Unanswered questions: 14Answer every question to send.Go to the first one"]);
    expect(toastCount()).toBe(0); // inline in the form, not a toast
    expect(apiFetch).toHaveBeenCalledTimes(1); // only the initial lookup

    for (const no of buttonWithText(wrapper, "No")) await no.trigger("click");
    await wrapper.find("input[type='checkbox']").setValue(false);
    await wrapper.find("form").trigger("submit");
    expect(alerts(wrapper)).toEqual(["Tick the consent box above to send."]);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await wrapper.find("input[type='checkbox']").setValue(true);
    expect(send().attributes("aria-disabled")).toBe("false");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { step: "medicalHistory", completed: true }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const [path, init] = apiFetch.mock.calls[1]!;
    expect(path).toBe("/api/v1/public/questionnaire/submit");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.token).toBe(TOKEN); // from the #fragment, sent only in the body
    expect(body.step).toBe("medicalHistory");
    expect(body.consent).toBe(true);
    expect(body.answers.has_diabetes).toBe(false);
    expect(wrapper.text()).toMatch(/Thank you, (Ana|Lucía)!/);
  });

  it("a second link opened in the same tab (only the #fragment changes) loads the new questionnaire", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 410, { code: "LINK_INVALID" }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("This link is no longer valid");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang")])));
    await wrapper.vm.$router.push(`/q#${"c".repeat(43)}`);
    await flushPromises();
    expect(wrapper.text()).toContain("Hello, Ana");
    expect(JSON.parse((apiFetch.mock.calls[1]![1] as RequestInit).body as string).token).toBe("c".repeat(43));
  });

  it("STOP-Bang via QR asks the patient only the four S-T-O-P questions", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang")])));
    const wrapper = await mountView();
    // S-T-O-P letters are the progress; the first card asks about snoring.
    expect(buttonWithText(wrapper, "S")).toHaveLength(1);
    expect(buttonWithText(wrapper, "G")).toHaveLength(0);
    expect(wrapper.text()).toContain("Do you snore loudly?");
    expect(wrapper.text()).toContain("Your clinic asks you");

    await answerCards(wrapper, "Yes", 4);
    expect(wrapper.text()).toContain("Check your answers");
    expect(wrapper.text()).not.toContain("Are you male?");
  });

  it("a bundle link walks the patient through each step — sign the consent, then the questionnaires — saving each on its own", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(
        true,
        200,
        lookup([step("informedConsent", "consent", { consent_html: "<p>I consent to the treatment.</p>" }), step("stopBang", "stop_bang")], { signer_name: "Ana P." }),
      ),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Step 1 of 2");
    expect(wrapper.find("[data-testid='secure-chip']").text()).toBe("Secure link · just for you");
    // The document is a card; signing only appears once it has been read.
    expect(wrapper.find(".signature-pad-stub").exists()).toBe(false);
    await readDocument(wrapper);
    expect(document.body.textContent).toContain("I consent to the treatment.");
    expect(wrapper.find(".signature-pad-stub").exists()).toBe(true);
    expect(wrapper.find("[data-testid='consent-signer']").text()).toContain("You are signing as Ana P.");
    expect(wrapper.find("[data-testid='consent-signer']").text()).toContain("Not you? Don't sign");
    // No address on file → no "email me a copy".
    expect(wrapper.find("[data-testid='consent-send-copy']").exists()).toBe(false);

    // No signature yet → nothing is sent.
    await wrapper.find("form").trigger("submit");
    expect(alerts(wrapper)).toEqual(["Sign in the box to continue."]);
    // Signed, but the clinic's privacy notice not accepted (CORE-113) → still nothing.
    signed = true;
    expect(wrapper.find("[data-testid='consent-privacy-link']").attributes("href")).toBe("https://neosleepcare.com/privacy");
    await wrapper.find("form").trigger("submit");
    expect(alerts(wrapper)).toEqual(["Confirm that you have read the privacy notice"]);
    // Privacy accepted, but "I have read and accept" not ticked → still nothing.
    await wrapper.find("[data-testid='consent-privacy'] input").setValue(true);
    await wrapper.find("form").trigger("submit");
    expect(alerts(wrapper)).toEqual(["Tick the box above to confirm you have read the document."]);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // The accept box lists the documents it accepts as plain text, unquoted and not bold, like the privacy box above (CORE-156).
    expect(wrapper.find("[data-testid='consent-accept']").text()).toBe("I have read Informed consent and accept its content.");
    expect(wrapper.find("[data-testid='consent-accept'] label strong").exists()).toBe(false);
    await wrapper.find("[data-testid='consent-accept'] input").setValue(true);
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { step: "informedConsent", completed: false }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const consentBody = JSON.parse((apiFetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(consentBody).toMatchObject({ token: TOKEN, step: "informedConsent", signatureDataUrl: SIGNATURE, readToEnd: true, privacyNoticeAccepted: true });

    expect(wrapper.text()).toContain("Step 2 of 2");
    expect(wrapper.text()).toContain("Do you snore loudly?");
    await answerCards(wrapper, "No", 4);
    expect(wrapper.text()).toContain("Send answers");
  });

  it("keeps unsent answers on the device: a reload of the same link resumes where the patient stopped", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang")])));
    const first = await mountView();
    await answerCards(first, "Yes", 2);
    await flushPromises();
    first.unmount();
    mounted.splice(mounted.indexOf(first), 1);

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang")])));
    const second = await mountView();
    await new Promise((resolve) => setTimeout(resolve, 20)); // token hashing (Web Crypto) is async
    await flushPromises();
    expect(second.text()).toContain("Question 3 of 4");
    localStorage.clear();
  });

  it("a consent whose text isn't available can be skipped without signing", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("informedConsent", "consent", { consent_html: null }), step("stopBang", "stop_bang")])));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("This document isn't available yet");
    await wrapper.findAll("button").find((b) => b.text() === "Continue")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Do you snore loudly?");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("a consent-only link ends on 'Document signed' with a receipt and the signed PDF to download", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, 200, lookup([step("informedConsent", "consent", { consent_html: "<p>I consent.</p>" })], { signer_name: "Ana P.", clinic_name: "Clínica Sonrisa", copy_email: "a***@example.mx" })),
    );
    const wrapper = await mountView();
    // One document: read → sign → done as three segments, no "Step 1 of 1".
    expect(wrapper.findAll("[data-testid='app-segment-progress-segment']")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("Step 1 of 1");

    await readDocument(wrapper);
    signed = true;
    await wrapper.find("[data-testid='consent-privacy'] input").setValue(true);
    await wrapper.find("[data-testid='consent-accept'] input").setValue(true);
    // The copy by email is the patient's own choice — offered, never pre-ticked.
    const copyBox = wrapper.find("[data-testid='consent-send-copy'] input");
    expect((copyBox.element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.find("[data-testid='consent-send-copy']").text()).toContain("a***@example.mx");
    await copyBox.setValue(true);
    expect(buttonWithText(wrapper, "Sign the document")).toHaveLength(1);
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, 201, {
        step: "informedConsent",
        completed: true,
        signed_copy: { filename: "informedConsent-2026-09-27.pdf", signed_at: "2026-09-27T12:32:00.000Z", pdf_base64: btoa("%PDF-1.7") },
        copy_emailed: true,
      }),
    );
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse((apiFetch.mock.calls[1]![1] as RequestInit).body as string).sendCopy).toBe(true);
    expect(wrapper.text()).toContain("A copy is on its way to a***@example.mx.");

    expect(wrapper.text()).toContain("Document signed");
    expect(wrapper.text()).toContain("Clínica Sonrisa already has your signed document");
    const receipt = wrapper.find("[data-testid='signed-receipt']");
    expect(receipt.text()).toContain("Clínica Sonrisa");

    const createObjectURL = vi.fn(() => "blob:copy");
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await receipt.find("button").trigger("click");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("the accept wording turns plural when one signature covers several documents (CORE-156)", () => {
    const { t } = createI18n({ legacy: false, locale: "en", messages: { en } }).global;
    const documents = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(["Informed consent", "Privacy notice"]);
    expect(t("app.questionnaire.consentStep.accept", { documents }, 2)).toBe(
      "I have read Informed consent and Privacy notice and accept their content.",
    );
  });

  it("a link whose steps are all done already shows the thank-you screen", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang", { done: true })])));
    const wrapper = await mountView();
    expect(wrapper.text()).toMatch(/Thank you, (Ana|Lucía)!/);
  });
});
