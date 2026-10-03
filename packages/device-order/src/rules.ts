import { z } from "zod";
import { FDI_TEETH, PRODUCT_CODES, TOOTH_STATES, type DeliveryAddress, type DeviceOrder } from "./model.js";
import { mainSplintCount, startingPointMm } from "./sequence.js";

/**
 * One problem with an order. `path` is a dot path into DeviceOrder (or
 * DeliveryAddress, prefixed `delivery.`), so the view marks exactly the field
 * the doctor edits; `code` is the i18n key suffix (app.deviceOrder.errors.<code>).
 */
export interface OrderIssue {
  path: string;
  code: OrderIssueCode;
  params?: Record<string, number | string>;
}

export const ORDER_ISSUE_CODES = [
  "required",
  "invalid",
  "outOfRange",
  "advanceZero",
  "retrusionNotBelowProtrusion",
  "advanceUnder5",
  "startingPointOutside",
  "personalizedValuesRequired",
  "tooManyAdditionalSplints",
  "desiredDateTooEarly",
  "emailInvalid",
  "tooLong",
] as const;
export type OrderIssueCode = (typeof ORDER_ISSUE_CODES)[number];

export interface OrderValidation {
  /** Block sending. */
  errors: OrderIssue[];
  /** Shown, never block — OA's own form only warns about these (rules §2). */
  warnings: OrderIssue[];
}

export interface OrderContext {
  /** OA's earliest delivery date for the product (GET /api/products/manufacturingDate), YYYY-MM-DD. */
  minDesiredDate?: string | null;
}

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);
const nullableInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

/** Shape and single-field ranges. Sources: XN validators (rules §1.3) and the UI clamps (`limit()`). */
const deviceOrderShape = z.object({
  dentistId: z.string().min(1),
  productCode: z.enum([PRODUCT_CODES.NOA, PRODUCT_CODES.NOA_TMJ]),
  retrusionMaxMm: mm(-20, 20),
  protrusionMaxMm: mm(-20, 20),
  startingPoint: z.object({ unit: z.enum(["mm", "%"]), value: z.number().finite().nullable() }),
  sequence: z.discriminatedUnion("type", [
    z.object({ type: z.literal("standard") }),
    z.object({
      type: z.literal("personalized"),
      unit: z.enum(["mm", "%"]),
      values: z.array(z.number().finite().nullable()),
      additionalSplints: z.array(z.number().finite()),
    }),
  ]),
  deviation: z.object({
    rightMm: z.number().finite(),
    rightAdvanceMm: z.number().finite(),
    leftMm: z.number().finite(),
    leftAdvanceMm: z.number().finite(),
  }),
  morningAligner: z.boolean(),
  verticalDimension: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("registro") }),
    z.object({ kind: z.literal("minimal") }),
    z.object({ kind: z.literal("mm"), value: mm(0, 20) }),
  ]),
  anteriorFrontalOpening: z.boolean(),
  slotsForElasticBands: z.boolean(),
  laterality: nullableInt(0, 5),
  limitOpening: nullableInt(0, 12),
  upperBand: z.number().int().min(1).max(6),
  lowerBand: z.number().int().min(1).max(6),
  finish: z.enum(["mixed", "scalloped"]),
  teeth: z.record(z.string(), z.enum(TOOTH_STATES)).refine((t) => Object.keys(t).every((k) => FDI_TEETH.includes(k))),
  observations: z.string(),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noContactDoctorForRedesign: z.boolean(),
});

/** Maps a zod issue to our codes: missing → required, a range → outOfRange with its bounds, anything else → invalid. */
function fromZod(issue: z.core.$ZodIssue): OrderIssue {
  const path = issue.path.join(".");
  if (issue.code === "invalid_type" && issue.input === undefined) return { path, code: "required" };
  if (issue.code === "too_small" || issue.code === "too_big") {
    if (issue.origin === "string" && issue.code === "too_small") return { path, code: "required" };
    const bound = Number(issue.code === "too_small" ? issue.minimum : issue.maximum);
    return { path, code: "outOfRange", params: issue.code === "too_small" ? { min: bound } : { max: bound } };
  }
  return { path, code: "invalid" };
}

/** Cross-field rules — each names the OA validator it mirrors. */
function crossFieldIssues(order: DeviceOrder, ctx: OrderContext): OrderValidation {
  const errors: OrderIssue[] = [];
  const warnings: OrderIssue[] = [];
  const mr = order.retrusionMaxMm;
  const mp = order.protrusionMaxMm;

  // XAt invalidAdvanced: MR and MP both 0 means nothing was measured.
  if (mr === 0 && mp === 0) errors.push({ path: "protrusionMaxMm", code: "advanceZero" });
  // isMaxRetrusionBiggerMaxProtrusion: MR must sit behind MP — a device can't advance backwards.
  else if (mr >= mp) errors.push({ path: "retrusionMaxMm", code: "retrusionNotBelowProtrusion" });
  // XAt invalidAdvancedLess5: OA's form only warns; its server accepted 3 mm (shot S4, 2026-10-03).
  else if (mp - mr < 5) warnings.push({ path: "protrusionMaxMm", code: "advanceUnder5", params: { min: 5 } });

  // YAt invalidStartPoint: SP is required and must lie between MR and MP.
  const sp = startingPointMm(order);
  if (sp === null) errors.push({ path: "startingPoint.value", code: "required" });
  else if (order.startingPoint.unit === "%" && (order.startingPoint.value! < 0 || order.startingPoint.value! > 100)) {
    errors.push({ path: "startingPoint.value", code: "outOfRange", params: { min: 0, max: 100 } });
  } else if (mr < mp && (sp < mr || sp > mp)) {
    errors.push({ path: "startingPoint.value", code: "startingPointOutside", params: { min: mr, max: mp } });
  }

  if (order.sequence.type === "personalized") {
    const needed = mainSplintCount(order.productCode);
    // KAt invalidPersonalizedSequence: the first two main splints must be filled (OA blocks on this).
    order.sequence.values.slice(0, Math.min(2, needed)).forEach((v, i) => {
      if (v === null) errors.push({ path: `sequence.values.${i}`, code: "personalizedValuesRequired" });
    });
    if (order.sequence.values.length < 2) errors.push({ path: "sequence.values", code: "personalizedValuesRequired" });
    // Additional splints are OA's seq4..seq6 — three slots.
    if (order.sequence.additionalSplints.length > 3) {
      errors.push({ path: "sequence.additionalSplints", code: "tooManyAdditionalSplints", params: { max: 3 } });
    }
  }

  // The desired date can't be earlier than OA's manufacturing date for the product.
  if (ctx.minDesiredDate && order.desiredDate && order.desiredDate < ctx.minDesiredDate) {
    errors.push({ path: "desiredDate", code: "desiredDateTooEarly", params: { min: ctx.minDesiredDate } });
  }
  return { errors, warnings };
}

/** The one validator the wizard (per step) and the API (before any partner call) both run. */
export function validateDeviceOrder(input: unknown, ctx: OrderContext = {}): OrderValidation {
  const parsed = deviceOrderShape.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map(fromZod), warnings: [] };
  return crossFieldIssues(parsed.data as DeviceOrder, ctx);
}

/** KJ (rules §1.2): when shipping to an address OA requires every field; name ≤ 40 chars; email format. */
const deliveryShape = z.object({
  name: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1),
  city: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  countryCode: z.string().trim().length(2),
  phone: z.string().trim().min(1),
  email: z.string().trim().min(1).pipe(z.email()),
});

export function validateDeliveryAddress(input: Partial<DeliveryAddress> | null | undefined): OrderIssue[] {
  const parsed = deliveryShape.safeParse(input ?? {});
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = `delivery.${issue.path.join(".")}`;
    const field = issue.path[0];
    if (issue.code === "too_big" && field === "name") return { path, code: "tooLong", params: { max: 40 } };
    if (field === "email" && issue.code !== "too_small" && issue.code !== "invalid_type") return { path, code: "emailInvalid" };
    if (issue.code === "too_small" || (issue.code === "invalid_type" && issue.input === undefined)) return { path, code: "required" };
    return { path, code: "invalid" };
  });
}

/** Errors only for the given paths (prefix match) — the wizard validates one step at a time. */
export function issuesFor(issues: OrderIssue[], prefixes: readonly string[]): OrderIssue[] {
  return issues.filter((i) => prefixes.some((p) => i.path === p || i.path.startsWith(`${p}.`)));
}
