import { reportCaught } from "@api";
import {
  defaultDeviceOrder,
  issuesFor,
  mainSplintCount,
  ORDER_ISSUE_CODES,
  PRODUCT_CODES,
  validateDeviceOrder,
  type DeliveryAddress,
  type DeviceOrder,
  type OrderIssue,
  type OrderIssueCode,
  type OrderValidation,
  type ProductCode,
  type SequenceUnit,
} from "@device-order";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "./useApi";
import { fieldErrorsFromResponse } from "./useFormErrors";
import { retryAction, useNotifications, type ShowOptions } from "./useNotifications";
import { defaultWizardExtras, draftToOrder, toDraft, type WizardExtras } from "../utils/deviceOrderDraft";

/**
 * The device-order wizard's state and every API call it makes (CORE-95).
 * The form state IS the canonical `DeviceOrder` from @device-order — the
 * same model the API validates and the provider adapter (apps/api) maps to
 * OrthoApnea — and per-step validation is that package's
 * `validateDeviceOrder` filtered by `issuesFor(step paths)`. No rule lives
 * here; a server 400 comes back with the same issue paths, so it marks the
 * same fields.
 *
 * Left in the component: step navigation, which issues are visible when
 * (NEO-109: only after a Next/Confirm attempt), and template-only values.
 */

export interface OrthoApneaProduct {
  id: number;
  code: string;
  nameEs: string;
  category: string;
}

/** A treatment_plan row saved as a draft (metadata.orthoapneaDraft set, never sent — see PatientOrthoApneaPanel's isDraft()). */
export interface OrthoApneaDraftPlan {
  id: string;
  metadata: Record<string, unknown> | null;
}

/** GET /api/v1/device-orders/context — where the device ships and OA's earliest delivery date. */
export interface DeviceOrderContext {
  /** The ordering doctor's primary HCO; `organizationId` only when the API names the record. */
  delivery: (DeliveryAddress & { organizationId?: string }) | null;
  deliveryIssues: OrderIssue[];
  minDesiredDate: string | null;
  rulesVersion: string;
}

/** The only products the wizard orders: NOA and NOA TMJ, one per order (Morning Aligner is a flag on it). */
export const ORDERABLE_PRODUCT_CODES: readonly ProductCode[] = [PRODUCT_CODES.NOA, PRODUCT_CODES.NOA_TMJ];

/** Which DeviceOrder paths each wizard step owns — `delivery.*` issues belong to step 1. */
export const STEP_PATHS: Readonly<Record<number, readonly string[]>> = {
  1: ["dentistId", "delivery"],
  2: [
    "productCode",
    "retrusionMaxMm",
    "protrusionMaxMm",
    "startingPoint",
    "sequence",
    "deviation",
    "morningAligner",
    "verticalDimension",
    "anteriorFrontalOpening",
    "slotsForElasticBands",
    "laterality",
    "limitOpening",
    "upperBand",
    "lowerBand",
    "finish",
    "teeth",
    "observations",
  ],
  3: [],
  4: ["desiredDate", "noContactDoctorForRedesign"],
};
export const WIZARD_STEPS = [1, 2, 3, 4] as const;

/** The step holding an issue's field, or undefined when no step shows it. */
export function stepOfPath(path: string): number | undefined {
  return WIZARD_STEPS.find((n) => issuesFor([{ path, code: "invalid" }], STEP_PATHS[n] ?? []).length > 0);
}

/** YYYY-MM-DD in local time. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fallback when OA's manufacturing date is unknown: today + 15 (OA's own observed default). */
export function fallbackDesiredDate(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 15);
  return isoDate(d);
}

const KNOWN_CODES = new Set<string>(ORDER_ISSUE_CODES);

/** Issues from an API body, keeping only well-formed ones; an unknown code reads as "invalid". */
function parseIssues(raw: unknown): OrderIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): OrderIssue[] => {
    if (typeof item !== "object" || item === null) return [];
    const { path, code, params } = item as { path?: unknown; code?: unknown; params?: unknown };
    if (typeof path !== "string") return [];
    const issue: OrderIssue = { path, code: typeof code === "string" && KNOWN_CODES.has(code) ? (code as OrderIssueCode) : "invalid" };
    if (typeof params === "object" && params !== null) issue.params = params as Record<string, number | string>;
    return [issue];
  });
}

/** An order already saved locally (treatment_plan) whose POST /device-orders still has to go through. */
interface UnsentOrder {
  planId: string;
  body: string;
}

const ORDER_TOAST: ShowOptions = { icon: "nav-treatment-plans" };

export function useOrthoApneaOrderWizard() {
  const { t } = useI18n();
  const notifications = useNotifications();

  const order = reactive<DeviceOrder>(defaultDeviceOrder());
  const extras = reactive<WizardExtras>(defaultWizardExtras());
  /** The additional-splint inputs as typed (an empty one is allowed while editing); the order carries the filled ones. */
  const additionalSplintInputs = ref<(number | null)[]>([]);

  const availableProductCodes = ref<ProductCode[]>([...ORDERABLE_PRODUCT_CODES]);
  const loadingProducts = ref(false);
  const doctorOptions = ref<{ title: string; value: string }[]>([]);
  const loadingDoctors = ref(false);
  const context = ref<DeviceOrderContext | null>(null);
  const contextLoading = ref(false);
  const contextFailed = ref(false);
  let contextRequest = 0;
  /** The treatment_plan this session saves into — a resumed draft's, or the one created on the first save/confirm. */
  const currentDraftPlanId = ref<string | null>(null);
  const submitLoading = ref(false);
  /** Issues the API returned on the last save/confirm (same paths as the local validator); cleared field by field as they're edited. */
  const serverIssues = ref<OrderIssue[]>([]);

  /** The shared validator over the live order — the wizard filters it per step. */
  const validation = computed<OrderValidation>(() =>
    validateDeviceOrder(JSON.parse(JSON.stringify(order)), { minDesiredDate: context.value?.minDesiredDate ?? null }),
  );

  /**
   * What's wrong with the shipping address: no doctor's HCO, missing fields
   * on it (the API's deliveryIssues), the context call failing, and any
   * `delivery.*` issue the API rejected an order with.
   */
  const deliveryIssues = computed<OrderIssue[]>(() => {
    const fromServer = serverIssues.value.filter((i) => i.path === "delivery" || i.path.startsWith("delivery."));
    if (!order.dentistId) return fromServer;
    if (contextFailed.value) return [{ path: "delivery", code: "invalid" }, ...fromServer];
    if (!context.value) return fromServer;
    if (!context.value.delivery) return [{ path: "delivery", code: "required" }, ...fromServer];
    return [...context.value.deliveryIssues, ...fromServer];
  });

  function syncAdditionalSplints() {
    if (order.sequence.type !== "personalized") return;
    order.sequence.additionalSplints = additionalSplintInputs.value.filter((v): v is number => v !== null && Number.isFinite(v));
  }

  /** OA's selectTypeStandard/Personalized: Estándar drops every personalized value; Individualizada starts empty in mm. */
  function setSequenceType(type: "standard" | "personalized") {
    if (order.sequence.type === type) return;
    additionalSplintInputs.value = [];
    order.sequence =
      type === "standard"
        ? { type: "standard" }
        : { type: "personalized", unit: "mm", values: Array.from({ length: mainSplintCount(order.productCode) }, () => null), additionalSplints: [] };
  }

  function setSequenceUnit(unit: SequenceUnit) {
    if (order.sequence.type === "personalized") order.sequence.unit = unit;
  }

  function setSequenceValue(index: number, value: number | null) {
    if (order.sequence.type === "personalized") order.sequence.values[index] = value;
  }

  function addAdditionalSplint() {
    if (order.sequence.type !== "personalized" || additionalSplintInputs.value.length >= 3) return;
    additionalSplintInputs.value.push(null);
  }

  function setAdditionalSplint(index: number, value: number | null) {
    additionalSplintInputs.value[index] = value;
    syncAdditionalSplints();
  }

  function removeAdditionalSplint(index: number) {
    additionalSplintInputs.value.splice(index, 1);
    syncAdditionalSplints();
  }

  /** NOA ↔ NOA TMJ: a personalized sequence keeps its values but gets exactly that product's number of main splints. */
  function setProductCode(code: ProductCode) {
    order.productCode = code;
    if (order.sequence.type === "personalized") {
      const count = mainSplintCount(code);
      order.sequence.values = Array.from({ length: count }, (_, i) => (order.sequence.type === "personalized" ? order.sequence.values[i] ?? null : null));
    }
  }

  /** SP as the doctor typed it — the field they filled decides the unit; clearing it frees the other field. */
  function setStartingPoint(unit: SequenceUnit, value: number | null) {
    if (value === null && order.startingPoint.unit !== unit) return;
    order.startingPoint = { unit, value };
  }

  /** Hidden "¿Cuándo desea el producto?": OA's earliest date for the product, today + 15 only when that's unknown. */
  function applyDesiredDate() {
    order.desiredDate = context.value?.minDesiredDate ?? fallbackDesiredDate();
  }

  /** Back to defaults, then a resumed draft (any version) on top — called each time the dialog opens. */
  function resetForOpen(draftPlan: OrthoApneaDraftPlan | null | undefined) {
    currentDraftPlanId.value = draftPlan?.id ?? null;
    serverIssues.value = [];
    context.value = null;
    contextFailed.value = false;
    const draft = draftPlan?.metadata?.orthoapneaDraft;
    const resumed = draft ? draftToOrder(draft) : { order: defaultDeviceOrder(), extras: defaultWizardExtras() };
    Object.assign(order, resumed.order);
    Object.assign(extras, resumed.extras);
    additionalSplintInputs.value = resumed.order.sequence.type === "personalized" ? [...resumed.order.sequence.additionalSplints] : [];
    applyDesiredDate();
  }

  /** Only to learn which of NOA / NOA TMJ the account can order; a failed load keeps both on offer. */
  async function loadProducts() {
    loadingProducts.value = true;
    try {
      const res = await apiFetch("/api/v1/partners/orthoapnea/products", { handleErrors: false });
      if (!res.ok) return;
      const data = (await res.json()) as { items: OrthoApneaProduct[] };
      const codes = ORDERABLE_PRODUCT_CODES.filter((code) => data.items.some((p) => p.code === code));
      if (codes.length === 0) return;
      availableProductCodes.value = codes;
      if (!codes.includes(order.productCode)) setProductCode(codes[0]!);
    } catch (err) {
      reportCaught(err, { where: "useOrthoApneaOrderWizard.loadProducts", level: "warn" });
    } finally {
      loadingProducts.value = false;
    }
  }

  /**
   * Doctor list, defaulting (only when the order has none yet, e.g. not a
   * resumed draft) to the patient's own HCP, else "Lorena" (the OA account
   * holder).
   */
  async function loadDoctorsAndDefault(patientId: string) {
    loadingDoctors.value = true;
    try {
      const [doctorsRes, patientRes] = await Promise.all([
        apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false }),
        apiFetch(`/api/v1/patient/${patientId}`, { handleErrors: false }),
      ]);
      if (doctorsRes.ok) {
        const data = (await doctorsRes.json()) as { items: { id: string; name: string }[] };
        doctorOptions.value = data.items.map((p) => ({ title: p.name, value: p.id }));
      }
      if (order.dentistId) return;
      let patientPractitionerId: string | null = null;
      if (patientRes.ok) patientPractitionerId = ((await patientRes.json()) as { practitioner_id: string | null }).practitioner_id;
      if (patientPractitionerId && doctorOptions.value.some((d) => d.value === patientPractitionerId)) {
        order.dentistId = patientPractitionerId;
      } else {
        order.dentistId = doctorOptions.value.find((d) => d.title.toUpperCase().includes("LORENA"))?.value ?? "";
      }
    } finally {
      loadingDoctors.value = false;
    }
  }

  /** Delivery (the doctor's primary HCO) + OA's earliest date; re-run whenever the doctor or product changes. */
  async function loadContext() {
    const request = ++contextRequest;
    context.value = null;
    contextFailed.value = false;
    if (!order.dentistId) return;
    contextLoading.value = true;
    try {
      const params = new URLSearchParams({ dentist_id: order.dentistId, product_code: order.productCode });
      const res = await apiFetch(`/api/v1/device-orders/context?${params.toString()}`, { handleErrors: false });
      if (request !== contextRequest) return;
      if (!res.ok) {
        contextFailed.value = true;
        return;
      }
      const body = (await res.json()) as Partial<DeviceOrderContext>;
      if (request !== contextRequest) return;
      context.value = {
        delivery: body.delivery ?? null,
        deliveryIssues: parseIssues(body.deliveryIssues),
        minDesiredDate: typeof body.minDesiredDate === "string" ? body.minDesiredDate : null,
        rulesVersion: typeof body.rulesVersion === "string" ? body.rulesVersion : "",
      };
      applyDesiredDate();
    } catch (err) {
      if (request !== contextRequest) return;
      reportCaught(err, { where: "useOrthoApneaOrderWizard.loadContext", level: "warn" });
      contextFailed.value = true;
    } finally {
      if (request === contextRequest) contextLoading.value = false;
    }
  }

  /** A treatment_plan 400 naming dentist_id marks the doctor field; anything else isn't a wizard field. */
  async function planRejection(res: Response): Promise<OrderIssue[]> {
    const fields = await fieldErrorsFromResponse(res);
    const reason = fields?.dentist_id;
    return reason ? [{ path: "dentistId", code: reason === "required" ? "required" : "invalid" }] : [];
  }

  /**
   * Saves the order into treatment_plan.metadata.orthoapneaDraft — POST the
   * first time, PATCH after. A plan with that marker and no partner link IS
   * the draft (see PatientOrthoApneaPanel's isDraft()).
   */
  async function persistDraft(patientId: string, sleepStudyId: string): Promise<boolean> {
    serverIssues.value = [];
    syncAdditionalSplints();
    const metadata = { orthoapneaDraft: toDraft(order, extras) };
    const dentist = order.dentistId || undefined;

    const res = currentDraftPlanId.value
      ? await apiFetch(`/api/v1/treatment-plan/${currentDraftPlanId.value}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata, dentist_id: dentist }),
          handleErrors: false,
        })
      : await apiFetch("/api/v1/treatment-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: patientId, sleep_study_id: sleepStudyId, type: "dental_appliance", dentist_id: dentist, metadata }),
          handleErrors: false,
        });
    if (res.ok && !currentDraftPlanId.value) currentDraftPlanId.value = ((await res.json()) as { id: string }).id;
    if (!res.ok) serverIssues.value = await planRejection(res);
    return res.ok;
  }

  /** The exact body POST /api/v1/device-orders receives. */
  function buildOrderBody(patientId: string, planId: string): { treatment_plan_id: string; patient_id: string; order: DeviceOrder } {
    syncAdditionalSplints();
    return { treatment_plan_id: planId, patient_id: patientId, order: JSON.parse(JSON.stringify(order)) as DeviceOrder };
  }

  /**
   * `conflict`: the API refused a second submit for this plan (409) — it was
   * already sent, or a send is still in flight / was interrupted. Retry would
   * only 409 again, so these get their own message and no Retry.
   */
  type ConflictCode = "PARTNER_ORDER_ALREADY_SUBMITTED" | "PARTNER_ORDER_SUBMISSION_PENDING";
  type SendResult =
    | { kind: "sent" }
    | { kind: "rejected"; issues: OrderIssue[] }
    | { kind: "conflict"; code: ConflictCode }
    | { kind: "failed" };

  async function sendOrder(unsent: UnsentOrder): Promise<SendResult> {
    try {
      const res = await apiFetch("/api/v1/device-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: unsent.body,
        handleErrors: false,
      });
      if (res.ok) return { kind: "sent" };
      if (res.status === 409) {
        // benign: a 409 without a JSON code still means "don't retry" — it falls back to SUBMISSION_PENDING.
        const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
        const code: ConflictCode =
          body?.code === "PARTNER_ORDER_ALREADY_SUBMITTED" ? "PARTNER_ORDER_ALREADY_SUBMITTED" : "PARTNER_ORDER_SUBMISSION_PENDING";
        return { kind: "conflict", code };
      }
      if (res.status === 400) {
        // benign: a non-JSON 400 names no field, so it falls through to the generic failure below.
        const body = (await res.json().catch(() => null)) as { error?: unknown; fields?: unknown } | null;
        if (body?.error === "validation") return { kind: "rejected", issues: parseIssues(body.fields) };
      }
      return { kind: "failed" };
    } catch (err) {
      reportCaught(err, { where: "useOrthoApneaOrderWizard.sendOrder" });
      return { kind: "failed" };
    }
  }

  /** Error toast; when the plan exists but the order didn't go through, Retry re-sends the same order. */
  function showOrderFailure(unsent: UnsentOrder | null): void {
    notifications.show(t("app.orthoApneaOrder.error"), "error", undefined, {
      ...ORDER_TOAST,
      action: unsent ? retryAction(() => resend(unsent)) : undefined,
    });
  }

  function showConflict(code: ConflictCode): void {
    const submitted = code === "PARTNER_ORDER_ALREADY_SUBMITTED";
    const key = submitted ? "app.orthoApneaOrder.alreadySubmitted" : "app.orthoApneaOrder.submissionPending";
    notifications.show(t(key), submitted ? "info" : "warning", undefined, ORDER_TOAST);
  }

  async function resend(unsent: UnsentOrder): Promise<void> {
    const result = await sendOrder(unsent);
    if (result.kind === "sent") notifications.show(t("app.orthoApneaOrder.success"), "success", undefined, ORDER_TOAST);
    else if (result.kind === "conflict") showConflict(result.code);
    else showOrderFailure(result.kind === "failed" ? unsent : null);
  }

  /**
   * Submit: make sure the treatment_plan exists (the draft's, else a new
   * one; the draft marker is cleared), then POST the canonical order to
   * /api/v1/device-orders — the API creates the OA patient itself. One
   * product per order, so there is exactly one call.
   *
   * Returns true when the dialog should close (sent, or the plan was saved
   * and only the partner call failed — the toast then carries Retry).
   * False keeps it open: a 400 the form can show (`serverIssues` set, no
   * toast), a re-entrant click, or nothing saved at all.
   */
  async function confirmOrder(patientId: string, sleepStudyId: string): Promise<boolean> {
    if (submitLoading.value) return false;
    serverIssues.value = [];
    submitLoading.value = true;
    try {
      const dentist = order.dentistId || undefined;
      let planId = currentDraftPlanId.value;
      const planRes = planId
        ? await apiFetch(`/api/v1/treatment-plan/${planId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dentist_id: dentist, metadata: {} }), // clears the draft marker
            handleErrors: false,
          })
        : await apiFetch("/api/v1/treatment-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: patientId, sleep_study_id: sleepStudyId, type: "dental_appliance", dentist_id: dentist }),
            handleErrors: false,
          });
      if (!planRes.ok) {
        serverIssues.value = await planRejection(planRes);
        if (serverIssues.value.length === 0) showOrderFailure(null);
        return false;
      }
      if (!planId) {
        planId = ((await planRes.json()) as { id: string }).id;
        // A resubmit after a 400 reuses this plan instead of creating another.
        currentDraftPlanId.value = planId;
      }

      const unsent: UnsentOrder = { planId, body: JSON.stringify(buildOrderBody(patientId, planId)) };
      const result = await sendOrder(unsent);
      if (result.kind === "sent") {
        notifications.show(t("app.orthoApneaOrder.success"), "success", undefined, ORDER_TOAST);
        return true;
      }
      if (result.kind === "rejected" && result.issues.some((i) => stepOfPath(i.path) !== undefined)) {
        serverIssues.value = result.issues;
        return false;
      }
      if (result.kind === "conflict") {
        showConflict(result.code);
        return true;
      }
      showOrderFailure(result.kind === "failed" ? unsent : null);
      return true;
    } catch (err) {
      reportCaught(err, { where: "useOrthoApneaOrderWizard.confirmOrder" });
      showOrderFailure(null);
      return false;
    } finally {
      submitLoading.value = false;
    }
  }

  return {
    order,
    extras,
    additionalSplintInputs,
    availableProductCodes,
    loadingProducts,
    doctorOptions,
    loadingDoctors,
    context,
    contextLoading,
    contextFailed,
    currentDraftPlanId,
    submitLoading,
    serverIssues,
    validation,
    deliveryIssues,
    setSequenceType,
    setSequenceUnit,
    setSequenceValue,
    addAdditionalSplint,
    setAdditionalSplint,
    removeAdditionalSplint,
    setProductCode,
    setStartingPoint,
    resetForOpen,
    loadProducts,
    loadDoctorsAndDefault,
    loadContext,
    buildOrderBody,
    persistDraft,
    confirmOrder,
  };
}
