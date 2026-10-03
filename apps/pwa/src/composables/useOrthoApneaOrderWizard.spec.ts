import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { PRODUCT_CODES, defaultDeviceOrder, type DeviceOrder } from "@device-order";

// useOrthoApneaOrderWizard calls vue-i18n's useI18n(), which throws outside a
// component setup() — a passthrough translator lets the composable run directly.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

import { useOrthoApneaOrderWizard, stepOfPath, fallbackDesiredDate } from "./useOrthoApneaOrderWizard";
import { useNotifications } from "./useNotifications";

function jsonResponse(status: number, body: unknown): Response {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    // apiFetch's error path reads res.clone().text(); fieldErrorsFromResponse reads clone().json().
    clone() {
      return { ...res, text: async () => JSON.stringify(body) };
    },
  };
  return res as unknown as Response;
}

type RouteHandler = (url: string, init?: RequestInit) => { status: number; body: unknown };

function stubFetchRoutes(routes: [string, RouteHandler][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const match = routes.find(([pattern]) => url.includes(pattern));
    if (!match) throw new Error(`Unmocked fetch call in test: ${url}`);
    const { status, body } = match[1](url, init);
    return jsonResponse(status, body);
  });
  vi.stubGlobal("fetch", fn);
  return { calls };
}

function bodyOf(call: { init?: RequestInit } | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
}

/** A complete, valid order (MR −2, MP 6, SP 2 mm). */
function fillValidOrder(order: DeviceOrder) {
  Object.assign(order, defaultDeviceOrder("doc-1"), {
    retrusionMaxMm: -2,
    protrusionMaxMm: 6,
    startingPoint: { unit: "mm", value: 2 },
    desiredDate: "2026-10-20",
  });
}

const CONTEXT = {
  delivery: { name: "Clínica Centro", address: "Av. Reforma 1", city: "CDMX", postalCode: "06600", countryCode: "MX", phone: "+52 55 0000 0000", email: "c@example.com" },
  deliveryIssues: [],
  minDesiredDate: "2026-10-21",
  rulesVersion: "2026-10-03.1",
};

beforeEach(() => {
  setActivePinia(createPinia());
  useNotifications().notifications.value = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOrthoApneaOrderWizard", () => {
  describe("the form is the canonical DeviceOrder", () => {
    it("opens on OA's defaults: NOA, Estándar sequence, no Morning Aligner, a desired date set", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.resetForOpen(null);
      expect(wizard.order.productCode).toBe(PRODUCT_CODES.NOA);
      expect(wizard.order.sequence).toEqual({ type: "standard" });
      expect(wizard.order.morningAligner).toBe(false);
      expect(wizard.order.desiredDate).toBe(fallbackDesiredDate());
    });

    it("validation is the shared validator: MR = MP = 0 is advanceZero; under 5 mm warns and blocks until confirmed", async () => {
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);
      wizard.order.retrusionMaxMm = 0;
      wizard.order.protrusionMaxMm = 0;
      expect(wizard.validation.value.errors).toContainEqual({ path: "protrusionMaxMm", code: "advanceZero" });

      wizard.order.protrusionMaxMm = 3;
      wizard.order.startingPoint = { unit: "mm", value: 1 };
      await nextTick();
      expect(wizard.validation.value.warnings).toEqual([{ path: "protrusionMaxMm", code: "advanceUnder5", params: { min: 5 } }]);
      expect(wizard.validation.value.errors).toEqual([{ path: "protrusionMaxMm", code: "warningNotConfirmed", params: { warning: "advanceUnder5" } }]);

      wizard.setWarningAcknowledged("advanceUnder5", true);
      expect(wizard.order.acknowledgedWarnings).toEqual(["advanceUnder5"]);
      expect(wizard.validation.value.errors).toEqual([]);
      expect(wizard.validation.value.warnings).toHaveLength(1);

      // Unticking re-blocks.
      wizard.setWarningAcknowledged("advanceUnder5", false);
      expect(wizard.validation.value.errors).toHaveLength(1);
    });

    it("an MR/MP change that clears the warning drops its confirmation — going back under 5 mm asks again", async () => {
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);
      wizard.order.retrusionMaxMm = 0;
      wizard.order.protrusionMaxMm = 3;
      wizard.order.startingPoint = { unit: "mm", value: 1 };
      await nextTick();
      wizard.setWarningAcknowledged("advanceUnder5", true);
      await nextTick();
      expect(wizard.order.acknowledgedWarnings).toEqual(["advanceUnder5"]);

      wizard.order.protrusionMaxMm = 6;
      await nextTick();
      expect(wizard.order.acknowledgedWarnings).toEqual([]);

      wizard.order.protrusionMaxMm = 3;
      await nextTick();
      expect(wizard.validation.value.errors.map((i) => i.code)).toEqual(["warningNotConfirmed"]);
    });

    it("registration: picking a method keeps only its own name (OA nulls the other); the picked name is OA's enum name", () => {
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);
      expect(wizard.order.registration).toEqual({ method: "impression" });

      wizard.setRegistrationMethod("scanner");
      expect(wizard.order.registration).toEqual({ method: "scanner", scannerTreatment: null });
      expect(wizard.validation.value.errors).toEqual([{ path: "registration.scannerTreatment", code: "required" }]);
      wizard.setScanner("MEDIT");
      expect(wizard.order.registration).toEqual({ method: "scanner", scannerTreatment: "MEDIT" });
      expect(wizard.validation.value.errors).toEqual([]);

      wizard.setRegistrationMethod("platform");
      expect(wizard.order.registration).toEqual({ method: "platform", scannerPlatform: null });
      wizard.setScanner("MEDIT_LINK");
      expect(wizard.order.registration).toEqual({ method: "platform", scannerPlatform: "MEDIT_LINK" });

      // A name from the other list is ignored rather than sent under the wrong field.
      wizard.setScanner("MEDIT");
      expect(wizard.order.registration).toEqual({ method: "platform", scannerPlatform: "MEDIT_LINK" });

      wizard.setRegistrationMethod("impression");
      expect(wizard.order.registration).toEqual({ method: "impression" });
    });

    it("maps issue paths to the step that shows them; delivery belongs to step 1", () => {
      expect(stepOfPath("dentistId")).toBe(1);
      expect(stepOfPath("delivery.phone")).toBe(1);
      expect(stepOfPath("startingPoint.value")).toBe(2);
      expect(stepOfPath("sequence.values.1")).toBe(2);
      expect(stepOfPath("desiredDate")).toBe(4);
      expect(stepOfPath("registration.scannerTreatment")).toBe(3);
      expect(stepOfPath("treatment_plan_id")).toBeUndefined();
    });
  });

  describe("sequence type", () => {
    it("Individualizada starts empty in mm with 3 main splints for NOA, 2 for NOA TMJ", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.setSequenceType("personalized");
      expect(wizard.order.sequence).toEqual({ type: "personalized", unit: "mm", values: [null, null, null], additionalSplints: [] });

      wizard.setProductCode(PRODUCT_CODES.NOA_TMJ);
      expect(wizard.order.sequence).toMatchObject({ values: [null, null] });
    });

    it("switching to Estándar resets every personalized value (OA's selectTypeStandard)", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.setSequenceType("personalized");
      wizard.setSequenceUnit("%");
      wizard.setSequenceValue(0, 10);
      wizard.addAdditionalSplint();
      wizard.setAdditionalSplint(0, 5);

      wizard.setSequenceType("standard");
      expect(wizard.order.sequence).toEqual({ type: "standard" });
      expect(wizard.additionalSplintInputs.value).toEqual([]);

      wizard.setSequenceType("personalized");
      expect(wizard.order.sequence).toEqual({ type: "personalized", unit: "mm", values: [null, null, null], additionalSplints: [] });
    });

    it("additional splints: at most 3, only filled ones go into the order", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.addAdditionalSplint(); // ignored on Estándar
      expect(wizard.additionalSplintInputs.value).toEqual([]);

      wizard.setSequenceType("personalized");
      for (let i = 0; i < 5; i++) wizard.addAdditionalSplint();
      expect(wizard.additionalSplintInputs.value).toHaveLength(3);
      wizard.setAdditionalSplint(0, 4);
      wizard.setAdditionalSplint(2, 6);
      expect(wizard.order.sequence).toMatchObject({ additionalSplints: [4, 6] });
    });
  });

  describe("starting point", () => {
    it("carries the field the doctor filled; clearing it frees the other unit", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.setStartingPoint("%", 50);
      expect(wizard.order.startingPoint).toEqual({ unit: "%", value: 50 });
      wizard.setStartingPoint("mm", null); // the locked mm field can't wipe the %
      expect(wizard.order.startingPoint).toEqual({ unit: "%", value: 50 });
      wizard.setStartingPoint("%", null);
      wizard.setStartingPoint("mm", 3);
      expect(wizard.order.startingPoint).toEqual({ unit: "mm", value: 3 });
    });
  });

  describe("drafts", () => {
    it("persistDraft stores the DeviceOrder: POST the first time, PATCH the same plan after", async () => {
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", (_url, init) => (init?.method === "POST" ? { status: 201, body: { id: "plan-99" } } : { status: 200, body: {} })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);
      wizard.order.morningAligner = true;

      expect(await wizard.persistDraft("patient-1", "study-1")).toBe(true);
      expect(wizard.currentDraftPlanId.value).toBe("plan-99");
      const first = bodyOf(calls[0]);
      expect(first).toMatchObject({ patient_id: "patient-1", sleep_study_id: "study-1", dentist_id: "doc-1" });
      expect(first.metadata).toMatchObject({ orthoapneaDraft: { schema: "deviceOrder", order: { dentistId: "doc-1", morningAligner: true } } });

      expect(await wizard.persistDraft("patient-1", "study-1")).toBe(true);
      expect(calls[1]!.url).toContain("/treatment-plan/plan-99");
      expect(calls[1]!.init?.method).toBe("PATCH");
    });

    it("resumes a saved DeviceOrder draft", () => {
      const wizard = useOrthoApneaOrderWizard();
      const saved = { ...defaultDeviceOrder("doc-7"), productCode: PRODUCT_CODES.NOA_TMJ, retrusionMaxMm: -3, protrusionMaxMm: 7, teeth: { "11": "relieve" } };
      wizard.resetForOpen({
        id: "plan-1",
        metadata: { orthoapneaDraft: { schema: "deviceOrder", order: { ...saved, registration: { method: "platform", scannerPlatform: "MEDIT_LINK" }, acknowledgedWarnings: ["advanceUnder5"] } } },
      });

      expect(wizard.currentDraftPlanId.value).toBe("plan-1");
      expect(wizard.order).toMatchObject({
        dentistId: "doc-7",
        productCode: "003",
        retrusionMaxMm: -3,
        protrusionMaxMm: 7,
        teeth: { "11": "relieve" },
        registration: { method: "platform", scannerPlatform: "MEDIT_LINK" },
        acknowledgedWarnings: ["advanceUnder5"],
      });
    });

    it("a DeviceOrder draft saved before D1/D2 (no acknowledgedWarnings, scanner as a label in extras) still loads", () => {
      const wizard = useOrthoApneaOrderWizard();
      const { registration: _r, acknowledgedWarnings: _a, ...older } = defaultDeviceOrder("doc-7");
      wizard.resetForOpen({ id: "plan-1", metadata: { orthoapneaDraft: { schema: "deviceOrder", order: older, extras: { registrationMethod: "scanner", scanner: "3Shape Trios" } } } });
      expect(wizard.order.acknowledgedWarnings).toEqual([]);
      expect(wizard.order.registration).toEqual({ method: "scanner", scannerTreatment: "SHAPE_TRIOS" });

      wizard.resetForOpen({ id: "plan-2", metadata: { orthoapneaDraft: { schema: "deviceOrder", order: older, extras: { registrationMethod: "scanner", scanner: "Some new brand" } } } });
      expect(wizard.order.registration).toEqual({ method: "scanner", scannerTreatment: null });

      wizard.resetForOpen({ id: "plan-3", metadata: { orthoapneaDraft: { schema: "deviceOrder", order: { ...older, registration: { method: "scanner", scannerTreatment: "Medit" }, acknowledgedWarnings: "x" } } } });
      expect(wizard.order.registration).toEqual({ method: "scanner", scannerTreatment: null });
      expect(wizard.order.acknowledgedWarnings).toEqual([]);
    });

    it("maps an old (pre-CORE-95) draft best-effort", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.resetForOpen({
        id: "plan-2",
        metadata: {
          orthoapneaDraft: {
            doctorId: "doc-1",
            products: [{ id: 3, code: "002", nameEs: "NOA", category: "x" }],
            retrusionMax: -3,
            protrusionMax: 7,
            startingPointPorcentage: 40,
            sequenceTypePersonalized: true,
            sequenceUnitInMM: false,
            sequence: { seq1: 11, seq2: 22, seq3: 33 },
            additionalSplints: ["5", ""],
            upperBandSplintDesign: "2",
            finish: "scallopedSplintDesign",
            verticalDimension: "minimal",
            teethStatus: ["11", "26", "99"],
            registrationMethod: "scanner",
            scanner: "Itero",
          },
        },
      });

      expect(wizard.order).toMatchObject({
        dentistId: "doc-1",
        productCode: "002",
        retrusionMaxMm: -3,
        protrusionMaxMm: 7,
        startingPoint: { unit: "%", value: 40 },
        sequence: { type: "personalized", unit: "%", values: [11, 22, 33], additionalSplints: [5] },
        upperBand: 2,
        finish: "scalloped",
        verticalDimension: { kind: "minimal" },
        teeth: { "11": "relieve", "26": "relieve" },
        registration: { method: "scanner", scannerTreatment: "ITERO" },
        acknowledgedWarnings: [],
      });
      expect(wizard.additionalSplintInputs.value).toEqual([5]);
    });

    it("never crashes on a broken draft — it opens as a fresh order", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.resetForOpen({ id: "plan-3", metadata: { orthoapneaDraft: { schema: "deviceOrder", order: "garbage" } } });
      expect(wizard.order.productCode).toBe(PRODUCT_CODES.NOA);
      wizard.resetForOpen({ id: "plan-4", metadata: { orthoapneaDraft: { products: "nope", sequence: 5, teethStatus: { a: 1 } } } });
      expect(wizard.order.sequence).toEqual({ type: "standard" });
    });
  });

  describe("context (delivery + earliest date)", () => {
    it("loads the doctor's HCO for the product and sets the hidden desired date to OA's minimum", async () => {
      const { calls } = stubFetchRoutes([["/device-orders/context", () => ({ status: 200, body: CONTEXT })]]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.resetForOpen(null);
      wizard.order.dentistId = "doc-1";

      await wizard.loadContext();

      expect(calls[0]!.url).toContain("/api/v1/device-orders/context?dentist_id=doc-1&product_code=002");
      expect(wizard.context.value?.delivery?.name).toBe("Clínica Centro");
      expect(wizard.order.desiredDate).toBe("2026-10-21");
      expect(wizard.deliveryIssues.value).toEqual([]);
    });

    it("no HCO or missing fields become delivery issues; a failed call too", async () => {
      let body: unknown = { ...CONTEXT, delivery: null, minDesiredDate: null };
      let status = 200;
      stubFetchRoutes([["/device-orders/context", () => ({ status, body })]]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.order.dentistId = "doc-1";

      await wizard.loadContext();
      expect(wizard.deliveryIssues.value).toEqual([{ path: "delivery", code: "required" }]);
      expect(wizard.order.desiredDate).toBe(fallbackDesiredDate());

      body = { ...CONTEXT, deliveryIssues: [{ path: "delivery.phone", code: "required" }] };
      await wizard.loadContext();
      expect(wizard.deliveryIssues.value).toEqual([{ path: "delivery.phone", code: "required" }]);

      status = 500;
      body = { error: "boom" };
      await wizard.loadContext();
      expect(wizard.contextFailed.value).toBe(true);
      expect(wizard.deliveryIssues.value).toEqual([{ path: "delivery", code: "invalid" }]);
    });
  });

  describe("confirmOrder", () => {
    it("creates the plan, then posts the canonical order to /api/v1/device-orders — no ensure-patient call", async () => {
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", () => ({ status: 201, body: { id: "plan-1" } })],
        ["/device-orders", () => ({ status: 201, body: { externalId: "oa-9", externalStatus: "1", warnings: [] } })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(true);

      expect(calls.map((c) => c.url)).toEqual(["/api/v1/treatment-plan", "/api/v1/device-orders"]);
      const sent = bodyOf(calls[1]);
      expect(sent.treatment_plan_id).toBe("plan-1");
      expect(sent.patient_id).toBe("patient-1");
      expect(sent.order).toEqual(JSON.parse(JSON.stringify(wizard.order)));
      expect(useNotifications().notifications.value[0]?.message).toBe("app.orthoApneaOrder.success");
    });

    it("Morning Aligner is a flag on the one order, never a second order", async () => {
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", () => ({ status: 201, body: { id: "plan-1" } })],
        ["/device-orders", () => ({ status: 201, body: { externalId: "oa-9" } })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);
      wizard.order.morningAligner = true;

      await wizard.confirmOrder("patient-1", "study-1");

      const orders = calls.filter((c) => c.url.endsWith("/device-orders"));
      expect(orders).toHaveLength(1);
      expect(bodyOf(orders[0]).order).toMatchObject({ productCode: "002", morningAligner: true });
    });

    it("reuses a resumed draft's plan and clears its draft marker", async () => {
      const { calls } = stubFetchRoutes([
        ["/treatment-plan/plan-7", () => ({ status: 200, body: {} })],
        ["/device-orders", () => ({ status: 201, body: {} })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.resetForOpen({ id: "plan-7", metadata: { orthoapneaDraft: { schema: "deviceOrder", order: defaultDeviceOrder("doc-1") } } });
      fillValidOrder(wizard.order);

      await wizard.confirmOrder("patient-1", "study-1");

      expect(calls[0]!.init?.method).toBe("PATCH");
      expect(bodyOf(calls[0])).toEqual({ dentist_id: "doc-1", metadata: {} });
      expect(bodyOf(calls[1]).treatment_plan_id).toBe("plan-7");
    });

    it("a 400 validation keeps the dialog open with the API's issues — no toast — and a resubmit reuses the plan", async () => {
      let reject = true;
      let plans = 0;
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", (_url, init) => (init?.method === "POST" ? { status: 201, body: { id: `plan-${++plans}` } } : { status: 200, body: {} })],
        [
          "/device-orders",
          () =>
            reject
              ? { status: 400, body: { error: "validation", fields: [{ path: "startingPoint.value", code: "startingPointOutside", params: { min: -2, max: 6 } }], warnings: [], rulesVersion: "x" } }
              : { status: 201, body: {} },
        ],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(false);
      expect(wizard.serverIssues.value).toEqual([{ path: "startingPoint.value", code: "startingPointOutside", params: { min: -2, max: 6 } }]);
      expect(useNotifications().notifications.value).toHaveLength(0);

      reject = false;
      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(true);
      expect(plans).toBe(1);
      expect(calls.filter((c) => c.url.includes("/treatment-plan"))[1]!.init?.method).toBe("PATCH");
    });

    it("a rejected dentist_id on the plan marks the doctor field — no toast, no order sent", async () => {
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", () => ({ status: 400, body: { error: "dentist_id does not reference an existing practitioner", code: "VALIDATION_ERROR", field: "dentist_id", reason: "invalid" } })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(false);
      expect(wizard.serverIssues.value).toEqual([{ path: "dentistId", code: "invalid" }]);
      expect(useNotifications().notifications.value).toHaveLength(0);
      expect(calls.some((c) => c.url.includes("/device-orders"))).toBe(false);
    });

    it("a partner failure closes with an error toast whose Retry re-sends the same order (same plan)", async () => {
      let attempt = 0;
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", () => ({ status: 201, body: { id: "plan-1" } })],
        ["/device-orders", () => (++attempt === 1 ? { status: 503, body: { error: "down" } } : { status: 201, body: {} })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(true);
      const toast = useNotifications().notifications.value[0]!;
      expect(toast.message).toBe("app.orthoApneaOrder.error");
      expect(toast.action?.labelKey).toBe("notification.action.retry");

      useNotifications().notifications.value = [];
      await toast.action!.run();
      const orders = calls.filter((c) => c.url.endsWith("/device-orders"));
      expect(orders).toHaveLength(2);
      expect(orders[1]!.init?.body).toBe(orders[0]!.init?.body);
      expect(useNotifications().notifications.value[0]?.message).toBe("app.orthoApneaOrder.success");
    });

    it.each([
      ["PARTNER_ORDER_ALREADY_SUBMITTED", "app.orthoApneaOrder.alreadySubmitted"],
      ["PARTNER_ORDER_SUBMISSION_PENDING", "app.orthoApneaOrder.submissionPending"],
    ])("a 409 %s gets its own message and no Retry (a retry would only 409 again)", async (code, message) => {
      stubFetchRoutes([
        ["/treatment-plan", () => ({ status: 201, body: { id: "plan-1" } })],
        ["/device-orders", () => ({ status: 409, body: { error: "conflict", code } })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(true);
      const toast = useNotifications().notifications.value[0]!;
      expect(toast.message).toBe(message);
      expect(toast.action).toBeUndefined();
    });

    it("no Retry when the plan itself couldn't be saved", async () => {
      stubFetchRoutes([["/treatment-plan", () => ({ status: 500, body: { error: "boom" } })]]);
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(false);
      const toast = useNotifications().notifications.value[0]!;
      expect(toast.message).toBe("app.orthoApneaOrder.error");
      expect(toast.action).toBeUndefined();
    });

    it("guards against re-entrant submission while one is in flight", async () => {
      let release!: () => void;
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          callCount += 1;
          if (callCount === 1) return new Promise((resolve) => { release = () => resolve(jsonResponse(201, { id: "plan-1" })); });
          return Promise.resolve(jsonResponse(201, {}));
        }),
      );
      const wizard = useOrthoApneaOrderWizard();
      fillValidOrder(wizard.order);

      const first = wizard.confirmOrder("patient-1", "study-1");
      expect(wizard.submitLoading.value).toBe(true);
      expect(await wizard.confirmOrder("patient-1", "study-1")).toBe(false);

      release();
      expect(await first).toBe(true);
      expect(wizard.submitLoading.value).toBe(false);
    });
  });
});
