import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
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

const notify = vi.fn();
vi.mock("../../composables/useNotifications", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNotifications: () => ({ show: notify }),
}));

import OrthoApneaOrderWizard from "./OrthoApneaOrderWizard.vue";

/**
 * NEO-109 — the wizard shows its errors in the form, never as a toast: Next
 * on a step with something to fix stays on that step with the summary box on
 * top (only that step's lines) and the message under the field; an API 400
 * naming a field opens the step holding it and marks it there.
 */

const messages = en as Record<string, string>;

function response(status: number, body: unknown): Response {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => res,
  };
  return res as unknown as Response;
}

const NOA = { id: 1, code: "NOA", nameEs: "NOA", category: "device" };
const DOCTOR = { id: "doc-1", name: "Dr. Test" };

interface Backend {
  doctors?: { id: string; name: string }[];
  treatmentPlan?: () => Response;
}

function stubBackend({ doctors = [DOCTOR], treatmentPlan = () => response(201, { id: "plan-1" }) }: Backend = {}) {
  apiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/v1/practitioner")) return response(200, { items: doctors });
    if (url.startsWith("/api/v1/patient/")) return response(200, { practitioner_id: doctors[0]?.id ?? null, region: "MX" });
    if (url.endsWith("/orthoapnea/products")) return response(200, { items: [NOA] });
    if (url.endsWith("/orthoapnea/clinics")) return response(200, { items: [{ id: 7, name: "Clinic" }] });
    if (url.endsWith("/orthoapnea/countries")) return response(200, { items: [] });
    if (url.includes("/ensure")) return response(200, { externalId: "oa-1" });
    if (url.startsWith("/api/v1/treatment-plan")) return treatmentPlan();
    if (url.endsWith("/orthoapnea/treatments")) return response(201, {});
    throw new Error(`Unmocked apiFetch call in test: ${url}`);
  });
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  apiFetch.mockReset();
  notify.mockReset();
});

async function openWizard(): Promise<VueWrapper> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(OrthoApneaOrderWizard, {
    props: { modelValue: false, patientId: "patient-1", sleepStudyId: "study-1" },
    global: { plugins: [i18n, vuetify, createPinia()] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  return wrapper;
}

function button(labelKey: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`button[aria-label="${messages[labelKey]}"]`);
  if (!el) throw new Error(`No button labelled ${labelKey}`);
  return el;
}

async function click(el: HTMLElement) {
  el.click();
  await flushPromises();
}

function summaryLines(): string[] {
  return Array.from(document.querySelectorAll("[data-testid=form-error-summary] li")).map((li) => li.textContent?.trim() ?? "");
}

function stepTitle(): string {
  return document.querySelector(".v-stepper-item--selected .v-stepper-item__title")?.textContent?.trim() ?? "";
}

function fieldMessage(key: string): string {
  return document.querySelector(`[data-field="${key}"] .v-messages`)?.textContent?.trim() ?? "";
}

describe("OrthoApneaOrderWizard — errors in the form (NEO-109)", () => {
  it("opens without any error — errors wait for the first Next", async () => {
    stubBackend({ doctors: [] });
    await openWizard();

    expect(document.querySelector("[data-testid=form-error-summary]")).toBeNull();
    expect(fieldMessage("doctorId")).toBe("");
  });

  it("Next on step 1 without a doctor stays there, with the summary on top and the message under the field", async () => {
    stubBackend({ doctors: [] });
    await openWizard();

    await click(button("app.orthoApneaOrder.actions.next"));

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step1.title"]);
    expect(summaryLines()).toEqual([`${messages["app.orthoApneaOrder.form.doctor"]} — ${messages["app.formRenderer.validation.required"]}`]);
    expect(fieldMessage("doctorId")).toBe(messages["app.formRenderer.validation.required"]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("a valid step moves on, and the next step opens clean; its own Next then shows only its errors", async () => {
    stubBackend();
    await openWizard();

    await click(button("app.orthoApneaOrder.actions.next"));
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(document.querySelector("[data-testid=form-error-summary]")).toBeNull();

    // MR and MP both start at 0 — MR must be strictly less than MP.
    await click(button("app.orthoApneaOrder.actions.next"));
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(summaryLines()).toEqual([`${messages["app.orthoApneaOrder.form.retrusionMax"]} — ${messages["app.orthoApneaOrder.validation.mrMustBeLessThanMp"]}`]);
  });

  it("a 400 naming dentist_id on Confirm returns to step 1 and marks the doctor — no toast", async () => {
    stubBackend({
      treatmentPlan: () => response(400, { error: "dentist_id does not reference an existing practitioner", code: "VALIDATION_ERROR", field: "dentist_id", reason: "invalid" }),
    });
    await openWizard();

    await click(button("app.orthoApneaOrder.actions.next"));
    const protrusion = document.querySelector('[data-field="protrusionMax"]')!;
    await click(protrusion.querySelector<HTMLButtonElement>(`button[aria-label="${messages["app.orthoApneaOrder.form.incrementValue"]}"]`)!);
    await click(button("app.orthoApneaOrder.actions.next"));
    await click(button("app.orthoApneaOrder.actions.next"));
    const confirm = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === messages["app.orthoApneaOrder.actions.confirm"])!;
    await click(confirm);

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step1.title"]);
    expect(summaryLines()).toEqual([`${messages["app.orthoApneaOrder.form.doctor"]} — ${messages["app.formRenderer.validation.invalid"]}`]);
    expect(fieldMessage("doctorId")).toBe(messages["app.formRenderer.validation.invalid"]);
    expect(notify).not.toHaveBeenCalled();
  });
});
