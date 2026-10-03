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
 * CORE-95 — the wizard runs the shared @device-order rules per step and shows
 * them in the form (NEO-109: summary on top, message under the field, never a
 * toast); delivery is the doctor's HCO from /device-orders/context; the
 * sequence type is a one-choice switch; submit posts the canonical order.
 */

const messages = en as Record<string, string>;
const msg = (key: string, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce((text, [k, v]) => text.replace(`{${k}}`, String(v)), messages[key] ?? key);

function response(status: number, body: unknown): Response {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body, clone: () => res };
  return res as unknown as Response;
}

const DOCTOR = { id: "doc-1", name: "Dr. Test" };
const DELIVERY = { name: "Clínica Centro", address: "Av. Reforma 1", city: "CDMX", postalCode: "06600", countryCode: "MX", phone: "+52 55 0000 0000", email: "c@example.com" };

interface Backend {
  doctors?: { id: string; name: string }[];
  context?: () => Response;
  deviceOrder?: () => Response;
}

function stubBackend({
  doctors = [DOCTOR],
  context = () => response(200, { delivery: DELIVERY, deliveryIssues: [], minDesiredDate: "2026-10-21", rulesVersion: "1" }),
  deviceOrder = () => response(201, { externalId: "oa-1", externalStatus: "1", warnings: [] }),
}: Backend = {}) {
  apiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/v1/practitioner")) return response(200, { items: doctors });
    if (url.startsWith("/api/v1/patient/")) return response(200, { practitioner_id: doctors[0]?.id ?? null, region: "MX" });
    if (url.endsWith("/orthoapnea/products")) return response(200, { items: [{ id: 3, code: "002", nameEs: "NOA", category: "x" }, { id: 4, code: "003", nameEs: "NOA TMJ", category: "x" }] });
    if (url.startsWith("/api/v1/device-orders/context")) return context();
    if (url === "/api/v1/device-orders") return deviceOrder();
    if (url.startsWith("/api/v1/treatment-plan")) return response(201, { id: "plan-1" });
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

function $(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Nothing matches ${selector}`);
  return el;
}

function button(labelKey: string): HTMLButtonElement {
  return $(`button[aria-label="${messages[labelKey]}"]`) as HTMLButtonElement;
}

function tab(scope: string, labelKey: string): HTMLElement {
  const el = Array.from(document.querySelectorAll<HTMLElement>(`${scope} [role=tab]`)).find((b) => b.textContent?.trim() === messages[labelKey]);
  if (!el) throw new Error(`No tab ${labelKey} in ${scope}`);
  return el;
}

async function click(el: HTMLElement) {
  el.click();
  await flushPromises();
}

async function type(selector: string, value: string) {
  const input = $(`${selector} input`) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
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

function cells(selector: string): string[] {
  return Array.from(document.querySelectorAll(`${selector} .oa-wizard__seq-cell`)).map((c) => c.textContent?.trim() ?? "");
}

const next = () => click(button("app.orthoApneaOrder.actions.next"));

/** From step 1 to a valid step 2: MR −2, MP 6, SP 2 mm. */
async function fillStep2() {
  await next();
  await type('[data-field="retrusionMaxMm"]', "-2");
  await type('[data-field="protrusionMaxMm"]', "6");
  await type("[data-testid=sp-mm]", "2");
}

async function confirm() {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === messages["app.orthoApneaOrder.actions.confirm"]);
  if (!btn) throw new Error("No confirm button");
  await click(btn);
}

describe("OrthoApneaOrderWizard — step 1: doctor and ship-to", () => {
  it("opens without any error — errors wait for the first Next", async () => {
    stubBackend({ doctors: [] });
    await openWizard();

    expect(document.querySelector("[data-testid=form-error-summary]")).toBeNull();
    expect(fieldMessage("dentistId")).toBe("");
  });

  it("Next without a doctor stays on step 1 with the shared 'required' under the field and in the summary", async () => {
    stubBackend({ doctors: [] });
    await openWizard();

    await next();

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step1.title"]);
    expect(summaryLines()).toEqual([`${messages["app.orthoApneaOrder.form.doctor"]} — ${messages["app.deviceOrder.errors.required"]}`]);
    expect(fieldMessage("dentistId")).toBe(messages["app.deviceOrder.errors.required"]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows the doctor's HCO read-only — no alternative-address choice", async () => {
    stubBackend();
    await openWizard();

    expect($("[data-testid=ship-to]").textContent).toContain("Clínica Centro");
    expect($("[data-testid=ship-to]").textContent).toContain("Av. Reforma 1");
    expect(document.querySelector("input[type=radio]")).toBeNull();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/device-orders/context?dentist_id=doc-1&product_code=002", expect.anything());
  });

  it("a doctor without an HCO blocks step 1 with the reason", async () => {
    stubBackend({ context: () => response(200, { delivery: null, deliveryIssues: [], minDesiredDate: null, rulesVersion: "1" }) });
    await openWizard();

    expect($("[data-testid=ship-to-error]").textContent).toContain(messages["app.deviceOrder.delivery.noClinic"]);
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step1.title"]);
    expect(summaryLines()).toEqual([`${messages["app.deviceOrder.delivery.title"]} — ${messages["app.deviceOrder.delivery.noClinic"]}`]);
  });

  it("an HCO with missing fields lists them and blocks step 1", async () => {
    stubBackend({
      context: () =>
        response(200, {
          delivery: { ...DELIVERY, phone: "", postalCode: "" },
          deliveryIssues: [{ path: "delivery.postalCode", code: "required" }, { path: "delivery.phone", code: "required" }],
          minDesiredDate: null,
          rulesVersion: "1",
        }),
    });
    await openWizard();

    const expected = msg("app.deviceOrder.delivery.incomplete", {
      fields: `${messages["app.deviceOrder.delivery.field.postalCode"]}, ${messages["app.deviceOrder.delivery.field.phone"]}`,
    });
    expect($("[data-testid=ship-to-error]").textContent).toContain(expected);
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step1.title"]);
  });
});

describe("OrthoApneaOrderWizard — step 2: shared rules and the sequence switch", () => {
  it("Next with the defaults shows the shared validator's codes and stays", async () => {
    stubBackend();
    await openWizard();
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(document.querySelector("[data-testid=form-error-summary]")).toBeNull();

    await next();

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(summaryLines()).toEqual([
      `${messages["app.orthoApneaOrder.form.protrusionMax"]} — ${messages["app.deviceOrder.errors.advanceZero"]}`,
      `${messages["app.orthoApneaOrder.form.startingPointHeader"]} — ${messages["app.deviceOrder.errors.required"]}`,
    ]);
  });

  it("SP outside MR..MP blocks; an advance under 5 mm only warns", async () => {
    stubBackend();
    await openWizard();
    await next();
    await type('[data-field="retrusionMaxMm"]', "0");
    await type('[data-field="protrusionMaxMm"]', "3");
    await type("[data-testid=sp-mm]", "9");

    expect($("[data-testid=mr-mp-warning]").textContent).toContain(msg("app.deviceOrder.errors.advanceUnder5", { min: 5 }));
    await next();
    expect(summaryLines()).toEqual([
      `${messages["app.orthoApneaOrder.form.startingPointHeader"]} — ${msg("app.deviceOrder.errors.startingPointOutside", { min: 0, max: 3 })}`,
    ]);

    await type("[data-testid=sp-mm]", "1");
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step3.title"]);
  });

  it("a % starting point shows its mm conversion and locks the mm field", async () => {
    stubBackend();
    await openWizard();
    await fillStep2();
    await type("[data-testid=sp-mm]", "");
    await type("[data-testid=sp-percent]", "50");

    expect($("[data-testid=sp-hint]").textContent).toBe(msg("app.deviceOrder.startingPointMmHint", { mm: 2 }));
    expect(($("[data-testid=sp-mm] input") as HTMLInputElement).disabled).toBe(true);
  });

  it("Estándar is the default and shows SP, -1, 1, 2 read-only in mm", async () => {
    stubBackend();
    await openWizard();
    await next();

    expect(tab("[data-testid=sequence]", "app.orthoApneaOrder.form.sequenceTypeStandard").getAttribute("aria-selected")).toBe("true");
    expect(cells("[data-testid=standard-sequence]")).toEqual(["SP", "-1", "1", "2"]);
    expect(document.querySelector("[data-testid=standard-sequence] input")).toBeNull();
    expect(document.querySelector(`button[aria-label="${messages["app.orthoApneaOrder.form.additionalSplintsAdd"]}"]`)).toBeNull();
  });

  it("clicking Individualizada selects it; clicking it again can't unselect it", async () => {
    stubBackend();
    await openWizard();
    await next();

    const personalized = tab("[data-testid=sequence]", "app.orthoApneaOrder.form.sequenceTypePersonalized");
    await click(personalized);
    expect(personalized.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelectorAll("[data-testid=personalized-sequence] input[type=number]")).toHaveLength(3);
    expect(button("app.orthoApneaOrder.form.additionalSplintsAdd")).toBeTruthy();

    await click(personalized);
    expect(personalized.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-testid=standard-sequence]")).toBeNull();
  });

  it("NOA TMJ: Estándar shows SP, -1, 1 and Individualizada has 2 inputs", async () => {
    stubBackend();
    await openWizard();
    await next();

    await click(tab("[data-field=productCode]", "app.deviceOrder.product.noaTmj"));
    expect(cells("[data-testid=standard-sequence]")).toEqual(["SP", "-1", "1"]);
    await click(tab("[data-testid=sequence]", "app.orthoApneaOrder.form.sequenceTypePersonalized"));
    expect(document.querySelectorAll("[data-testid=personalized-sequence] input[type=number]")).toHaveLength(2);
  });

  it("Individualizada without its first splints blocks with personalizedValuesRequired", async () => {
    stubBackend();
    await openWizard();
    await fillStep2();
    await click(tab("[data-testid=sequence]", "app.orthoApneaOrder.form.sequenceTypePersonalized"));

    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(summaryLines()).toEqual([`${messages["app.orthoApneaOrder.form.sequenceType"]} — ${messages["app.deviceOrder.errors.personalizedValuesRequired"]}`]);
  });
});

describe("OrthoApneaOrderWizard — submit", () => {
  it("posts the canonical order once to /api/v1/device-orders; Morning Aligner is a flag, not a second order", async () => {
    stubBackend();
    const wrapper = await openWizard();
    await fillStep2();
    const ma = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")).find((i) =>
      i.closest(".v-checkbox")?.textContent?.includes(messages["app.orthoApneaOrder.form.morningAligner"]),
    )!;
    ma.click();
    await flushPromises();
    await next();
    await next();
    await confirm();

    const urls = apiFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/ensure") || u.includes("/orthoapnea/treatments"))).toBe(false);
    const orders = apiFetch.mock.calls.filter((c) => c[0] === "/api/v1/device-orders");
    expect(orders).toHaveLength(1);
    const body = JSON.parse(String((orders[0]![1] as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      treatment_plan_id: "plan-1",
      patient_id: "patient-1",
      order: {
        dentistId: "doc-1",
        productCode: "002",
        retrusionMaxMm: -2,
        protrusionMaxMm: 6,
        startingPoint: { unit: "mm", value: 2 },
        sequence: { type: "standard" },
        morningAligner: true,
        desiredDate: "2026-10-21",
      },
    });
    expect(notify).toHaveBeenCalledWith(messages["app.orthoApneaOrder.success"], "success", undefined, expect.anything());
    expect(wrapper.emitted("submitted")).toHaveLength(1);
  });

  it("a server 400 maps fields[].path back onto the field and opens its step — no toast", async () => {
    stubBackend({
      deviceOrder: () =>
        response(400, {
          error: "validation",
          fields: [{ path: "startingPoint.value", code: "startingPointOutside", params: { min: -2, max: 6 } }],
          warnings: [],
          rulesVersion: "1",
        }),
    });
    const wrapper = await openWizard();
    await fillStep2();
    await next();
    await next();
    await confirm();

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(summaryLines()).toEqual([
      `${messages["app.orthoApneaOrder.form.startingPointHeader"]} — ${msg("app.deviceOrder.errors.startingPointOutside", { min: -2, max: 6 })}`,
    ]);
    expect(notify).not.toHaveBeenCalled();
    expect(wrapper.emitted("submitted")).toBeUndefined();

    // Editing the rejected field clears the API's verdict.
    await type("[data-testid=sp-mm]", "3");
    expect(summaryLines()).toEqual([]);
  });

  it("a server 400 on the delivery returns to step 1", async () => {
    stubBackend({
      deviceOrder: () => response(400, { error: "validation", fields: [{ path: "delivery.email", code: "emailInvalid" }], warnings: [], rulesVersion: "1" }),
    });
    await openWizard();
    await fillStep2();
    await next();
    await next();
    await confirm();

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step1.title"]);
    expect($("[data-testid=ship-to-error]").textContent).toContain(messages["app.deviceOrder.delivery.field.email"]);
  });
});
