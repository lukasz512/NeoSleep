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
import MandibularRuler from "./MandibularRuler.vue";
import { useAuthStore } from "../../stores/auth";

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

async function openWizard(role: string = "admin"): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  // The wizard reads the role from the auth store: a doctor skips step 1 (NEO-210).
  const auth = useAuthStore();
  // Only the role matters here; the rest of AuthUser is irrelevant to the wizard.
  auth.$patch({ user: { id: "u-1", email: "u@example.com", role } as never });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(OrthoApneaOrderWizard, {
    props: { modelValue: false, patientId: "patient-1", sleepStudyId: "study-1" },
    global: { plugins: [i18n, vuetify, pinia] },
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

describe("OrthoApneaOrderWizard — a doctor orders only as themselves (NEO-210, 2026-10-03)", () => {
  const doctorContext = (extra: Record<string, unknown> = {}) => () =>
    response(200, { dentistId: "doc-self", delivery: DELIVERY, deliveryIssues: [], minDesiredDate: "2026-10-21", rulesVersion: "1", ...extra });

  function stepNumbers(): string[] {
    return Array.from(document.querySelectorAll(".v-stepper-item")).map((el) => el.querySelector(".v-avatar")?.textContent?.trim() ?? "");
  }

  it("opens on construction data, with three steps numbered 1–3 and no doctor or clinic choice", async () => {
    stubBackend({ context: doctorContext() });
    await openWizard("doctor");

    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(document.querySelectorAll(".v-stepper-item")).toHaveLength(3);
    expect(stepNumbers()).toEqual(["1", "2", "3"]);
    expect(document.querySelector('[data-field="dentistId"]')).toBeNull();
    expect(document.querySelector("[data-testid=wizard-step-1]")).toBeNull();
    // No Back button on the first step the doctor sees.
    expect(document.querySelector(`button[aria-label="${messages["app.orthoApneaOrder.actions.back"]}"]`)).toBeNull();
  });

  it("asks the API for the doctor's own context (no dentist_id, no doctor list) and orders with the id the API returned", async () => {
    stubBackend({ context: doctorContext() });
    await openWizard("doctor");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/device-orders/context?product_code=002", expect.anything());
    expect(apiFetch.mock.calls.some((c) => String(c[0]).startsWith("/api/v1/practitioner"))).toBe(false);

    await type('[data-field="retrusionMaxMm"]', "-2");
    await type('[data-field="protrusionMaxMm"]', "6");
    await type("[data-testid=sp-mm]", "2");
    await next();
    await next();
    await confirm();
    const order = JSON.parse(String((apiFetch.mock.calls.find((c) => c[0] === "/api/v1/device-orders")![1] as RequestInit).body)).order;
    expect(order.dentistId).toBe("doc-self");
  });

  it("an incomplete clinic address says so and tells the doctor to contact NeoSleep, and blocks Next", async () => {
    stubBackend({
      context: doctorContext({
        delivery: { ...DELIVERY, phone: "" },
        deliveryIssues: [{ path: "delivery.phone", code: "required" }],
      }),
    });
    await openWizard("doctor");

    const alert = $("[data-testid=doctor-address-error]").textContent ?? "";
    expect(alert).toContain(messages["app.deviceOrder.delivery.doctorTitle"]);
    expect(alert).toContain(msg("app.deviceOrder.delivery.doctorIncomplete", { fields: messages["app.deviceOrder.delivery.field.phone"] }));
    expect(alert).not.toContain(messages["app.deviceOrder.delivery.openRecord"]);

    await type('[data-field="retrusionMaxMm"]', "-2");
    await type('[data-field="protrusionMaxMm"]', "6");
    await type("[data-testid=sp-mm]", "2");
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);
    expect(summaryLines()).toContain(
      `${messages["app.deviceOrder.delivery.title"]} — ${msg("app.deviceOrder.delivery.doctorIncomplete", { fields: messages["app.deviceOrder.delivery.field.phone"] })}`,
    );
  });

  it("no clinic linked: the doctor message, not the admin's 'assign it in the record'", async () => {
    stubBackend({ context: doctorContext({ delivery: null, deliveryIssues: [{ path: "delivery", code: "required" }] }) });
    await openWizard("doctor");

    const alert = $("[data-testid=doctor-address-error]").textContent ?? "";
    expect(alert).toContain(messages["app.deviceOrder.delivery.doctorNoClinic"]);
    expect(alert).not.toContain(messages["app.deviceOrder.delivery.noClinic"]);
  });

  it("an admin still sees all four steps, starting at step 1", async () => {
    stubBackend();
    await openWizard();
    expect(document.querySelectorAll(".v-stepper-item")).toHaveLength(4);
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

  it("SP outside MR..MP blocks; an advance under 5 mm warns and blocks until the doctor ticks the confirmation (Łukasz D1)", async () => {
    stubBackend();
    await openWizard();
    await next();
    await type('[data-field="retrusionMaxMm"]', "0");
    await type('[data-field="protrusionMaxMm"]', "3");
    await type("[data-testid=sp-mm]", "9");

    expect($("[data-testid=mr-mp-warning]").textContent).toContain(msg("app.deviceOrder.errors.advanceUnder5", { min: 5 }));
    expect(document.querySelector("[data-testid=mr-mp-error]")).toBeNull();
    expect($("[data-testid=confirm-advance-under5]").textContent).toContain(messages["app.deviceOrder.confirmAdvanceUnder5"]);
    await next();
    expect(summaryLines()).toEqual([
      `${messages["app.orthoApneaOrder.form.startingPointHeader"]} — ${msg("app.deviceOrder.errors.startingPointOutside", { min: 0, max: 3 })}`,
      `${messages["app.orthoApneaOrder.form.protrusionMax"]} — ${messages["app.deviceOrder.errors.warningNotConfirmed"]}`,
    ]);

    await type("[data-testid=sp-mm]", "1");
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step2.title"]);

    const confirmBox = $("[data-testid=confirm-advance-under5] input") as HTMLInputElement;
    await click(confirmBox);
    expect(summaryLines()).toEqual([]);
    // Unticking re-blocks.
    await click(confirmBox);
    expect(summaryLines()).toHaveLength(1);
    await click(confirmBox);
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step3.title"]);
  });

  it("the confirmation goes away with the warning — no checkbox once the range is 5 mm or more", async () => {
    stubBackend();
    await openWizard();
    await next();
    await type('[data-field="retrusionMaxMm"]', "0");
    await type('[data-field="protrusionMaxMm"]', "3");
    expect(document.querySelector("[data-testid=confirm-advance-under5]")).not.toBeNull();
    await type('[data-field="protrusionMaxMm"]', "6");
    expect(document.querySelector("[data-testid=confirm-advance-under5]")).toBeNull();
    expect(document.querySelector("[data-testid=mr-mp-warning]")).toBeNull();
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

  it("dragging SP on the ruler writes the mm field (and takes over from a typed %) — NEO-225", async () => {
    stubBackend();
    const wrapper = await openWizard();
    await fillStep2();
    await type("[data-testid=sp-mm]", "");
    await type("[data-testid=sp-percent]", "50");
    wrapper.findComponent(MandibularRuler).vm.$emit("update:startingPointMm", 3);
    await flushPromises();

    expect(($("[data-testid=sp-mm] input") as HTMLInputElement).value).toBe("3");
    expect(($("[data-testid=sp-percent] input") as HTMLInputElement).value).toBe("");
    expect(document.querySelector("[data-testid=sp-hint]")).toBeNull();
  });

  it("the SP message line is always there, so a hint or error never pushes the layout — NEO-225", async () => {
    stubBackend();
    await openWizard();
    await fillStep2();
    expect($("[data-testid=sp-message]").textContent?.trim()).toBe("");
    await type("[data-testid=sp-mm]", "");
    await type("[data-testid=sp-percent]", "50");
    expect($("[data-testid=sp-message] [data-testid=sp-hint]").textContent).toBe(msg("app.deviceOrder.startingPointMmHint", { mm: 2 }));
  });

  it("Paso 3: Dimensión vertical is a two-option switch, Apertura frontal / Ganchos are photo cards — all reach the order (NEO-225)", async () => {
    stubBackend();
    await openWizard();
    await fillStep2();
    await click(tab('[data-field="verticalDimension"]', "app.deviceOrder.verticalDimension.minimal"));
    for (const field of ["anteriorFrontalOpening", "slotsForElasticBands"]) {
      expect($(`[data-field="${field}"] [data-testid=addon-photo]`)).toBeTruthy();
      ($(`[data-field="${field}"] [data-testid=addon-switch] input`) as HTMLInputElement).click();
    }
    await flushPromises();
    await next();
    await next();
    await confirm();

    const order = apiFetch.mock.calls.find((c) => c[0] === "/api/v1/device-orders")!;
    const body = JSON.parse(String((order[1] as RequestInit).body)) as { order: Record<string, unknown> };
    expect(body.order).toMatchObject({ verticalDimension: { kind: "minimal" }, anteriorFrontalOpening: true, slotsForElasticBands: true });
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

describe("OrthoApneaOrderWizard — step 3: registration (Łukasz D2)", () => {
  let wizard: VueWrapper;
  async function toStep3() {
    stubBackend();
    wizard = await openWizard();
    await fillStep2();
    await next();
    expect(stepTitle()).toBe(messages["app.orthoApneaOrder.step3.title"]);
  }

  function radio(labelKey: string): HTMLInputElement {
    const el = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=radio]")).find((i) =>
      i.closest(".v-radio")?.textContent?.includes(messages[labelKey]!),
    );
    if (!el) throw new Error(`No radio ${labelKey}`);
    return el;
  }

  /** Picks by the label the doctor sees (VSelect's menu is a teleported overlay, so the pick is the component's own event). */
  async function pick(field: string, label: string) {
    const select = wizard
      .findAllComponents({ name: "VSelect" })
      .find((s) => (s.attributes("data-field") ?? s.element.getAttribute("data-field")) === field);
    if (!select) throw new Error(`No select ${field}`);
    const items = select.props("items") as { title: string; value: string }[];
    const item = items.find((i) => i.title === label);
    if (!item) throw new Error(`No option ${label} in ${field}: ${items.map((i) => i.title).join(", ")}`);
    select.vm.$emit("update:modelValue", item.value);
    await flushPromises();
  }

  it("scanner: Next without one is 'required'; the picker shows brand names and the order carries OA's name", async () => {
    await toStep3();
    await click(radio("app.orthoApneaOrder.form.scannerIntraoral"));
    await next();
    expect(summaryLines()).toEqual([`${messages["app.orthoApneaOrder.form.scanner"]} — ${messages["app.deviceOrder.errors.required"]}`]);

    await pick("registration.scannerTreatment", "3Shape Trios");
    await next();
    await confirm();
    const order = JSON.parse(String((apiFetch.mock.calls.find((c) => c[0] === "/api/v1/device-orders")![1] as RequestInit).body)).order;
    expect(order.registration).toEqual({ method: "scanner", scannerTreatment: "SHAPE_TRIOS" });
  });

  it("platform: the picker lists OA's platforms and the order carries OA's name, never a scanner", async () => {
    await toStep3();
    await click(radio("app.deviceOrder.registration.platform"));
    await pick("registration.scannerPlatform", "Medit Link");
    await next();
    await confirm();
    const order = JSON.parse(String((apiFetch.mock.calls.find((c) => c[0] === "/api/v1/device-orders")![1] as RequestInit).body)).order;
    expect(order.registration).toEqual({ method: "platform", scannerPlatform: "MEDIT_LINK" });
  });

  it("no promotion-code field on any step, and none in the order sent", async () => {
    stubBackend();
    await openWizard();
    const promoVisible = () =>
      document.querySelector("[data-field*=promo i], [data-testid*=promo i], .oa-wizard__promo-row") !== null ||
      /promo/i.test(Array.from(document.querySelectorAll("label")).map((l) => l.textContent ?? "").join(" "));
    expect(promoVisible()).toBe(false);
    await fillStep2();
    expect(promoVisible()).toBe(false);
    await next();
    expect(promoVisible()).toBe(false);
    await next();
    expect(promoVisible()).toBe(false);
    await confirm();
    const body = String((apiFetch.mock.calls.find((c) => c[0] === "/api/v1/device-orders")![1] as RequestInit).body);
    expect(body).not.toMatch(/promo/i);
  });
});

describe("OrthoApneaOrderWizard — submit", () => {
  it("posts the canonical order once to /api/v1/device-orders; Morning Aligner is a flag, not a second order", async () => {
    stubBackend();
    const wrapper = await openWizard();
    await fillStep2();
    // NEO-225: Morning Aligner is a photo card with a switch under "Add-ons".
    const card = $('[data-field="morningAligner"]');
    expect(card.textContent).toContain(messages["app.orthoApneaOrder.form.morningAligner"]);
    ($('[data-field="morningAligner"] [data-testid=addon-switch] input') as HTMLInputElement).click();
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
        registration: { method: "impression" },
        acknowledgedWarnings: [],
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
