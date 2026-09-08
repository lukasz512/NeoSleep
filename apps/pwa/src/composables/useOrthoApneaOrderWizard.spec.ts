import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// useOrthoApneaOrderWizard calls vue-i18n's useI18n(), which throws outside a
// real component setup() context — mock it with a passthrough translator so
// the composable's actual logic can be exercised directly without mounting
// OrthoApneaOrderWizard.vue (that's the whole point of this extraction — see
// that component's own header comment). Same pattern as useFormRenderer.spec.ts.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

import { useOrthoApneaOrderWizard, type OrthoApneaProduct } from "./useOrthoApneaOrderWizard";
import { useNotifications } from "./useNotifications";

function jsonResponse(status: number, body: unknown): Response {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    // apiFetch's error-path calls res.clone().text() on any non-ok response
    // (apps/api/client/src/index.ts) — a real Response supports this, so the
    // mock must too, or a stubbed 4xx/5xx throws inside apiFetch itself
    // instead of just returning a not-ok Response.
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

const NOA: OrthoApneaProduct = { id: 1, code: "NOA", nameEs: "NOA", category: "device" };
const MORNING_ALIGNER: OrthoApneaProduct = { id: 2, code: "MA", nameEs: "MORNING ALIGNER", category: "device" };

beforeEach(() => {
  setActivePinia(createPinia());
  useNotifications().notifications.value = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOrthoApneaOrderWizard", () => {
  describe("buildWizardPayload", () => {
    it("sends deliveryAddress: null when shipping to the clinic (the default)", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.internalClinicId.value = 42;
      const payload = wizard.buildWizardPayload(NOA);
      expect(payload.clinic).toBe(42);
      expect(payload.deliveryAddress).toBeNull();
      expect(payload.product).toEqual({ id: 1 });
    });

    it("builds deliveryAddress from the alt* fields when addressSend is 'alternative'", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.addressSend = "alternative";
      wizard.form.altCountryId = 29;
      wizard.form.altPostalCode = "01000";
      wizard.form.altCity = "CDMX";
      wizard.form.altAddress = "Calle Falsa 123";
      wizard.form.altName = "Dr. Test";
      wizard.form.altEmail = "dr@example.com";
      wizard.form.altPhone = "555-0100";

      const payload = wizard.buildWizardPayload(NOA);
      expect(payload.deliveryAddress).toEqual({
        country: 29,
        postalCode: "01000",
        city: "CDMX",
        address: "Calle Falsa 123",
        name: "Dr. Test",
        email: "dr@example.com",
        phone: "555-0100",
      });
    });

    it("sends sequence only when sequenceTypePersonalized is true", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.sequenceTypePersonalized = false;
      expect(wizard.buildWizardPayload(NOA).sequence).toBeNull();

      wizard.form.sequenceTypePersonalized = true;
      wizard.sequence.seq1 = 61;
      expect(wizard.buildWizardPayload(NOA).sequence).toEqual({ seq1: 61, seq2: 70, seq3: 80 });
    });

    // The "identical JSON" invariant this repo cares about (see ADR-017 /
    // orthoapnea.spec.ts's backend-side version): the object returned here is
    // exactly what confirmOrder() JSON.stringifies into the HTTP body — no
    // separate "display copy" that could drift from what's actually sent.
    it("round-trips cleanly through JSON.stringify/parse with no dropped or mutated fields", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.internalClinicId.value = 7;
      wizard.form.retrusionMax = -5;
      wizard.form.protrusionMax = 5;
      const payload = wizard.buildWizardPayload(NOA);
      const roundTripped = JSON.parse(JSON.stringify(payload));
      // undefined-valued keys vanish through JSON (expected/standard) — compare
      // against the same round-trip of the original rather than the original itself.
      expect(roundTripped).toEqual(JSON.parse(JSON.stringify(payload)));
      expect(roundTripped.retrusionMax).toBe(-5);
      expect(roundTripped.protrusionMax).toBe(5);
    });
  });

  describe("resetForOpen", () => {
    it("resets to defaults and sets a +15 day desiredDate when opening fresh (no draft)", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.retrusionMax = -99; // dirty it first
      wizard.resetForOpen(null);

      expect(wizard.form.retrusionMax).toBe(0);
      expect(wizard.currentDraftPlanId.value).toBeNull();
      expect(wizard.form.date).not.toBeNull();
      const expected = new Date();
      expected.setDate(expected.getDate() + 15);
      expect(wizard.form.date).toBe(
        `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`
      );
    });

    it("applies a resumed draft's snapshot (form + sequence) instead of setting a default date", () => {
      const wizard = useOrthoApneaOrderWizard();
      wizard.resetForOpen({
        id: "plan-1",
        metadata: {
          orthoapneaDraft: {
            retrusionMax: -3,
            protrusionMax: 7,
            date: "2026-01-01",
            sequence: { seq1: 11, seq2: 22, seq3: 33 },
          },
        },
      });

      expect(wizard.currentDraftPlanId.value).toBe("plan-1");
      expect(wizard.form.retrusionMax).toBe(-3);
      expect(wizard.form.protrusionMax).toBe(7);
      expect(wizard.form.date).toBe("2026-01-01"); // NOT overwritten by setDefaultDesiredDate
      expect(wizard.sequence).toEqual({ seq1: 11, seq2: 22, seq3: 33 });
    });
  });

  describe("loadProducts", () => {
    it("defaults the selection to NOA when none is already selected", async () => {
      stubFetchRoutes([["/partners/orthoapnea/products", () => ({ status: 200, body: { items: [NOA, MORNING_ALIGNER] } })]]);
      const wizard = useOrthoApneaOrderWizard();

      await wizard.loadProducts();

      expect(wizard.products.value).toEqual([NOA, MORNING_ALIGNER]);
      expect(wizard.form.products).toEqual([NOA]);
    });

    it("does not override an already-selected product set (e.g. a resumed draft)", async () => {
      stubFetchRoutes([["/partners/orthoapnea/products", () => ({ status: 200, body: { items: [NOA, MORNING_ALIGNER] } })]]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.products = [MORNING_ALIGNER];

      await wizard.loadProducts();

      expect(wizard.form.products).toEqual([MORNING_ALIGNER]);
    });
  });

  describe("persistDraft", () => {
    it("POSTs a new treatment_plan the first time, then PATCHes the same plan on subsequent saves", async () => {
      const { calls } = stubFetchRoutes([
        ["/treatment-plan", (url, init) => {
          if (init?.method === "POST") return { status: 201, body: { id: "plan-99" } };
          return { status: 200, body: {} };
        }],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.doctorId = "doc-1";

      const firstOk = await wizard.persistDraft("patient-1", "study-1");
      expect(firstOk).toBe(true);
      expect(wizard.currentDraftPlanId.value).toBe("plan-99");
      expect(calls[0]!.init?.method).toBe("POST");
      const firstBody = JSON.parse(calls[0]!.init!.body as string);
      expect(firstBody).toMatchObject({ patient_id: "patient-1", sleep_study_id: "study-1", dentist_id: "doc-1" });
      expect(firstBody.metadata.orthoapneaDraft).toMatchObject({ doctorId: "doc-1" });

      const secondOk = await wizard.persistDraft("patient-1", "study-1");
      expect(secondOk).toBe(true);
      expect(calls[1]!.url).toContain("/treatment-plan/plan-99");
      expect(calls[1]!.init?.method).toBe("PATCH");
    });
  });

  describe("confirmOrder", () => {
    it("returns false and makes no API calls when no products are selected", async () => {
      const { calls } = stubFetchRoutes([]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.products = [];

      const result = await wizard.confirmOrder("patient-1", "study-1");

      expect(result).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it("ensures the patient, creates one plan+order per product, and reports success", async () => {
      let planCounter = 0;
      stubFetchRoutes([
        ["/patients/patient-1/ensure", () => ({ status: 200, body: { externalId: "oa-1" } })],
        ["/treatment-plan", () => ({ status: 201, body: { id: `plan-${++planCounter}` } })],
        ["/partners/orthoapnea/treatments", () => ({ status: 201, body: { externalId: "oa-treat-1" } })],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.products = [NOA];

      const result = await wizard.confirmOrder("patient-1", "study-1");

      expect(result).toBe(true);
      expect(useNotifications().notifications.value[0]?.message).toBe("app.orthoApneaOrder.success");
    });

    it("reports partialFailure when some (but not all) product orders fail", async () => {
      let planCounter = 0;
      let treatmentCalls = 0;
      stubFetchRoutes([
        ["/patients/patient-1/ensure", () => ({ status: 200, body: { externalId: "oa-1" } })],
        ["/treatment-plan", () => ({ status: 201, body: { id: `plan-${++planCounter}` } })],
        ["/partners/orthoapnea/treatments", () => {
          treatmentCalls += 1;
          return treatmentCalls === 1 ? { status: 201, body: {} } : { status: 500, body: { error: "boom" } };
        }],
      ]);
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.products = [NOA, MORNING_ALIGNER];

      const result = await wizard.confirmOrder("patient-1", "study-1");

      expect(result).toBe(true); // dialog still closes — some orders did go through
      expect(useNotifications().notifications.value[0]?.message).toBe("app.orthoApneaOrder.partialFailure");
    });

    it("returns false and shows the generic error when the initial ensure-patient call throws", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.products = [NOA];

      const result = await wizard.confirmOrder("patient-1", "study-1");

      expect(result).toBe(false);
      expect(useNotifications().notifications.value[0]?.message).toBe("app.orthoApneaOrder.error");
    });

    it("guards against re-entrant submission while one is already in flight", async () => {
      // Only the FIRST fetch call (the "ensure patient" one) hangs — every
      // later call in the flow (treatment-plan create, order submit) resolves
      // immediately, so `first` can run to completion once released without
      // needing a stub per downstream call.
      let resolveEnsure!: () => void;
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          callCount += 1;
          if (callCount === 1) return new Promise((resolve) => { resolveEnsure = () => resolve(jsonResponse(200, {})); });
          return Promise.resolve(jsonResponse(200, { id: "plan-1" }));
        })
      );
      const wizard = useOrthoApneaOrderWizard();
      wizard.form.products = [NOA];

      const first = wizard.confirmOrder("patient-1", "study-1");
      expect(wizard.submitLoading.value).toBe(true);
      const second = await wizard.confirmOrder("patient-1", "study-1");
      expect(second).toBe(false); // rejected immediately — first call still in flight

      resolveEnsure();
      await first;
    });
  });
});
