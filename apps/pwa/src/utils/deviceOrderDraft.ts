import {
  defaultDeviceOrder,
  FDI_TEETH,
  mainSplintCount,
  PRODUCT_CODES,
  TOOTH_STATES,
  type DeviceOrder,
  type ProductCode,
  type Registration,
  type Sequence,
  type SequenceUnit,
  type ToothState,
  type VerticalDimension,
} from "@device-order";
import { isScannerPlatform, isScannerTreatment, scannerFromLegacyLabel } from "./deviceOrderRegistration";

/**
 * treatment_plan.metadata.orthoapneaDraft — the order wizard's saved
 * progress. Since CORE-95 it holds the canonical DeviceOrder (plus the few
 * wizard-only choices the order model doesn't carry). Drafts saved before
 * that hold the old OA-shaped form; `draftToOrder` maps those best-effort and
 * never throws — a field it can't read just keeps its default.
 *
 * Drafts saved before Łukasz's D1/D2 (2026-10-03) have no
 * `acknowledgedWarnings` (→ []) and keep the scanner choice beside the order,
 * in `extras: { registrationMethod, scanner: <brand label> }` — mapped to
 * `order.registration` with OA's scanner name.
 */

export interface DeviceOrderDraft {
  schema: "deviceOrder";
  order: DeviceOrder;
}

export function toDraft(order: DeviceOrder): DeviceOrderDraft {
  return { schema: "deviceOrder", order: JSON.parse(JSON.stringify(order)) as DeviceOrder };
}

type Loose = Record<string, unknown>;

function isObject(v: unknown): v is Loose {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function productCode(v: unknown, fallback: ProductCode): ProductCode {
  return v === PRODUCT_CODES.NOA || v === PRODUCT_CODES.NOA_TMJ ? v : fallback;
}

function band(v: unknown, fallback: number): number {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 6 ? n : fallback;
}

function unit(v: unknown): SequenceUnit {
  return v === "%" ? "%" : "mm";
}

function sequenceFrom(v: unknown, code: ProductCode): Sequence {
  if (!isObject(v) || v.type !== "personalized") return { type: "standard" };
  const values = Array.isArray(v.values) ? v.values.map(num) : [];
  const count = mainSplintCount(code);
  return {
    type: "personalized",
    unit: unit(v.unit),
    values: Array.from({ length: count }, (_, i) => values[i] ?? null),
    additionalSplints: (Array.isArray(v.additionalSplints) ? v.additionalSplints.map(num) : [])
      .filter((n): n is number => n !== null)
      .slice(0, 3),
  };
}

function verticalFrom(v: unknown): VerticalDimension {
  if (isObject(v)) {
    if (v.kind === "minimal") return { kind: "minimal" };
    const value = num(v.value);
    if (v.kind === "mm" && value !== null) return { kind: "mm", value };
  }
  if (v === "minimal") return { kind: "minimal" };
  return { kind: "registro" };
}

function teethFrom(v: unknown): Record<string, ToothState> {
  const teeth: Record<string, ToothState> = {};
  if (Array.isArray(v)) {
    // Old drafts: an array of relieved FDI teeth.
    for (const tooth of v) if (typeof tooth === "string" && FDI_TEETH.includes(tooth)) teeth[tooth] = "relieve";
  } else if (isObject(v)) {
    for (const [tooth, state] of Object.entries(v)) {
      if (FDI_TEETH.includes(tooth) && (TOOTH_STATES as readonly unknown[]).includes(state)) teeth[tooth] = state as ToothState;
    }
  }
  return teeth;
}

function fromCanonical(o: Loose): DeviceOrder {
  const base = defaultDeviceOrder();
  const code = productCode(o.productCode, base.productCode);
  const sp = isObject(o.startingPoint) ? o.startingPoint : {};
  const dev = isObject(o.deviation) ? o.deviation : {};
  return {
    dentistId: str(o.dentistId, base.dentistId),
    productCode: code,
    retrusionMaxMm: num(o.retrusionMaxMm) ?? base.retrusionMaxMm,
    protrusionMaxMm: num(o.protrusionMaxMm) ?? base.protrusionMaxMm,
    startingPoint: { unit: unit(sp.unit), value: num(sp.value) },
    sequence: sequenceFrom(o.sequence, code),
    deviation: {
      rightMm: num(dev.rightMm) ?? 0,
      rightAdvanceMm: num(dev.rightAdvanceMm) ?? 0,
      leftMm: num(dev.leftMm) ?? 0,
      leftAdvanceMm: num(dev.leftAdvanceMm) ?? 0,
    },
    morningAligner: bool(o.morningAligner, base.morningAligner),
    verticalDimension: verticalFrom(o.verticalDimension),
    anteriorFrontalOpening: bool(o.anteriorFrontalOpening, base.anteriorFrontalOpening),
    slotsForElasticBands: bool(o.slotsForElasticBands, base.slotsForElasticBands),
    laterality: o.laterality === null ? null : (num(o.laterality) ?? base.laterality),
    limitOpening: o.limitOpening === null ? null : (num(o.limitOpening) ?? base.limitOpening),
    upperBand: band(o.upperBand, base.upperBand),
    lowerBand: band(o.lowerBand, base.lowerBand),
    finish: o.finish === "scalloped" ? "scalloped" : "mixed",
    teeth: teethFrom(o.teeth),
    observations: str(o.observations, ""),
    desiredDate: str(o.desiredDate, ""),
    noContactDoctorForRedesign: bool(o.noContactDoctorForRedesign, false),
    registration: base.registration,
    acknowledgedWarnings: Array.isArray(o.acknowledgedWarnings) ? o.acknowledgedWarnings.filter((w): w is string => typeof w === "string") : [],
  };
}

/** Pre-CORE-95 drafts: the OA-shaped wizard form (doctorId, products[], seq1..3, …). */
function fromLegacy(d: Loose): DeviceOrder {
  const base = defaultDeviceOrder();
  const firstProduct = Array.isArray(d.products) && isObject(d.products[0]) ? d.products[0] : null;
  const productName = firstProduct ? str(firstProduct.nameEs, "").toUpperCase() : "";
  const code: ProductCode = firstProduct?.code === PRODUCT_CODES.NOA_TMJ || productName.includes("TMJ") ? PRODUCT_CODES.NOA_TMJ : PRODUCT_CODES.NOA;

  const spMm = num(d.startingPoint);
  const spPct = num(d.startingPointPorcentage);
  const legacySeq = isObject(d.sequence) ? d.sequence : {};
  const sequence: Sequence =
    d.sequenceTypePersonalized === true
      ? {
          type: "personalized",
          unit: d.sequenceUnitInMM === true ? "mm" : "%",
          values: [num(legacySeq.seq1), num(legacySeq.seq2), num(legacySeq.seq3)].slice(0, mainSplintCount(code)),
          additionalSplints: (Array.isArray(d.additionalSplints) ? d.additionalSplints.map(num) : [])
            .filter((n): n is number => n !== null)
            .slice(0, 3),
        }
      : { type: "standard" };

  return {
    ...base,
    dentistId: str(d.doctorId, ""),
    productCode: code,
    retrusionMaxMm: num(d.retrusionMax) ?? 0,
    protrusionMaxMm: num(d.protrusionMax) ?? 0,
    startingPoint: spMm !== null ? { unit: "mm", value: spMm } : { unit: spPct !== null ? "%" : "mm", value: spPct },
    sequence,
    deviation: {
      rightMm: num(d.deviationRight) ?? 0,
      rightAdvanceMm: num(d.deviationAdvanceRight) ?? 0,
      leftMm: num(d.deviationLeft) ?? 0,
      leftAdvanceMm: num(d.deviationAdvanceLeft) ?? 0,
    },
    morningAligner: bool(d.morningAligner, false),
    verticalDimension: verticalFrom(d.verticalDimension),
    anteriorFrontalOpening: bool(d.anteriorFrontalOpening, false),
    slotsForElasticBands: bool(d.slotsForElasticBands, false),
    laterality: num(d.laterality) ?? base.laterality,
    limitOpening: num(d.limitOpening) ?? base.limitOpening,
    upperBand: band(d.upperBandSplintDesign, base.upperBand),
    lowerBand: band(d.lowerBandSplintDesign, base.lowerBand),
    finish: d.finish === "scallopedSplintDesign" ? "scalloped" : "mixed",
    teeth: teethFrom(d.teethStatus),
    observations: str(d.observations, ""),
    desiredDate: str(d.date, ""),
    noContactDoctorForRedesign: bool(d.noContactDoctorForRedesign, false),
  };
}

/** A registration as the order stores it; a name OA doesn't know becomes null (the doctor picks again). */
function registrationFrom(v: unknown): Registration | null {
  if (!isObject(v)) return null;
  if (v.method === "impression") return { method: "impression" };
  if (v.method === "scanner") return { method: "scanner", scannerTreatment: isScannerTreatment(v.scannerTreatment) ? v.scannerTreatment : null };
  if (v.method === "platform") return { method: "platform", scannerPlatform: isScannerPlatform(v.scannerPlatform) ? v.scannerPlatform : null };
  return null;
}

/** Before D2 the choice lived beside the order: `{ registrationMethod, scanner: <brand label> }`. */
function registrationFromLegacy(v: Loose): Registration {
  if (v.registrationMethod !== "scanner") return { method: "impression" };
  return { method: "scanner", scannerTreatment: scannerFromLegacyLabel(v.scanner) };
}

/** Any saved draft → the order to resume with. Unknown or broken input yields the defaults. */
export function draftToOrder(draft: unknown): DeviceOrder {
  if (!isObject(draft)) return defaultDeviceOrder();
  try {
    if (draft.schema === "deviceOrder" && isObject(draft.order)) {
      const order = fromCanonical(draft.order);
      order.registration =
        registrationFrom(draft.order.registration) ?? registrationFromLegacy(isObject(draft.extras) ? draft.extras : {});
      return order;
    }
    return { ...fromLegacy(draft), registration: registrationFromLegacy(draft) };
  } catch {
    // benign: a draft we can't read at all resumes as a fresh order instead of breaking the wizard.
    return defaultDeviceOrder();
  }
}
