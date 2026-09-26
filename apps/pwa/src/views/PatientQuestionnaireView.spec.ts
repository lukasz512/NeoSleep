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
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import PatientQuestionnaireView from "./PatientQuestionnaireView.vue";

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

    await wrapper.find("input[type='checkbox']").setValue(true);
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("Please answer every question.");
    expect(apiFetch).toHaveBeenCalledTimes(1); // only the initial lookup

    for (const no of buttonWithText(wrapper, "No")) await no.trigger("click");
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
    expect(wrapper.text()).toContain("Thank you!");
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
      jsonResponse(true, 200, lookup([step("informedConsent", "consent", { consent_html: "<p>I consent to the treatment.</p>" }), step("stopBang", "stop_bang")])),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Step 1 of 2");
    expect(wrapper.text()).toContain("I consent to the treatment.");

    // No signature yet → nothing is sent.
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("Sign in the box to continue.");
    expect(apiFetch).toHaveBeenCalledTimes(1);

    signed = true;
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { step: "informedConsent", completed: false }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const consentBody = JSON.parse((apiFetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(consentBody).toMatchObject({ token: TOKEN, step: "informedConsent", signatureDataUrl: SIGNATURE });

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

  it("a link whose steps are all done already shows the thank-you screen", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, lookup([step("stopBang", "stop_bang", { done: true })])));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Thank you!");
  });
});
