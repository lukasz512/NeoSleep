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

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
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

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { kind: "stop_bang", patient_first_name: "Ana", clinic_name: null }));
    await wrapper.findAll("button").find((b) => b.text() !== "")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Hello, Ana");
  });

  it("greets by first name only and won't submit until every question is answered and consent given", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { kind: "medical_history", patient_first_name: "Lucía", clinic_name: "Clínica Sonrisa" }));
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Hello, Lucía");
    expect(wrapper.text()).toContain("Clínica Sonrisa asks you");
    expect(buttonWithText(wrapper, "No")).toHaveLength(14);

    await wrapper.find("input[type='checkbox']").setValue(true);
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("Please answer every question.");
    expect(apiFetch).toHaveBeenCalledTimes(1); // only the initial GET

    for (const no of buttonWithText(wrapper, "No")) await no.trigger("click");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { kind: "medical_history" }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const [path, init] = apiFetch.mock.calls[1]!;
    expect(path).toBe("/api/v1/public/questionnaire/submit");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.token).toBe(TOKEN); // from the #fragment, sent only in the body
    expect(body.consent).toBe(true);
    expect(body.answers.has_diabetes).toBe(false);
    expect(wrapper.text()).toContain("Thank you!");
  });

  it("a second link opened in the same tab (only the #fragment changes) loads the new questionnaire", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 410, { code: "LINK_INVALID" }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("This link is no longer valid");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { kind: "stop_bang", patient_first_name: "Ana", clinic_name: null }));
    await wrapper.vm.$router.push(`/q#${"c".repeat(43)}`);
    await flushPromises();
    expect(wrapper.text()).toContain("Hello, Ana");
    expect(JSON.parse((apiFetch.mock.calls[1]![1] as RequestInit).body as string).token).toBe("c".repeat(43));
  });

  it("STOP-Bang via QR asks the patient only the four S-T-O-P questions", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { kind: "stop_bang", patient_first_name: "Ana", clinic_name: null }));
    const wrapper = await mountView();
    expect(buttonWithText(wrapper, "Yes")).toHaveLength(4);
    expect(wrapper.text()).toContain("Do you snore loudly?");
    expect(wrapper.text()).not.toContain("Are you male?");
    expect(wrapper.text()).toContain("Your clinic asks you");
  });
});
