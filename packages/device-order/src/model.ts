/**
 * The device order in NeoCRM's own words (CORE-95). The view and the API both
 * speak this shape; only a provider adapter (apps/api, e.g. the OrthoApnea one)
 * translates it to a partner's wire format. When OrthoApnea ships a real API,
 * a new adapter maps this same model, and neither the view nor these rules
 * change.
 *
 * Every rule here mirrors one OrthoApnea rule and cites its source in
 * docs/partners/orthoapnea-order-rules.md (Łukasz, 2026-10-03: the rules come
 * from OA, we never invent our own).
 */

/** Bumped whenever a rule changes; stored with every submitted order for audit. */
export const RULES_VERSION = "2026-10-03.2";

/** OA product codes (enum `an`, rules §4.4). Only these two are orderable from the wizard today. */
export const PRODUCT_CODES = { NOA: "002", NOA_TMJ: "003" } as const;
export type ProductCode = (typeof PRODUCT_CODES)[keyof typeof PRODUCT_CODES];

/** Tooth states OA knows (teethStatus, rules §3.2). */
export const TOOTH_STATES = ["regular", "crown", "bridge", "missing", "implant", "veneer", "relieve"] as const;
export type ToothState = (typeof TOOTH_STATES)[number];

/** FDI quadrants 1–4, teeth 1–8 — OA's teethStatus covers exactly these 32. */
export const FDI_TEETH: readonly string[] = [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((t) => `${q}${t}`));

export type SequenceUnit = "mm" | "%";

export type Sequence =
  | { type: "standard" }
  | {
      type: "personalized";
      unit: SequenceUnit;
      /** Main lower splints after SP: 2 values for NOA TMJ, 3 for NOA (rules §2, "third value: NOA only"). */
      values: (number | null)[];
      /** Additional splints (OA seq4..seq6): personalized only, at most 3, same unit as the sequence. */
      additionalSplints: number[];
    };

/**
 * OA's scanner enum `ba` (rules "Enums" `ba`), sent as the NAME — the
 * intraoral or desk scanner the doctor scanned with.
 */
export const SCANNER_TREATMENTS = [
  "SHAPE_TRIOS",
  "SHAPE_DESK_SCANNER",
  "SIRONA",
  "CARESTREAM",
  "MEDIT",
  "DENTALWINGS",
  "ITERO",
  "HERON",
  "PLANMECA_EMERALD",
  "EXOCAD_DESK_SCANNER",
  "IMETRIC_DESK_SCANNER",
  "FINOSCAN_RELATION_DESK_SCANNER",
  "DENTALWINGS_SERIES_3_DESK_SCANNER",
  "AORALSCAN_SHINING_3D",
  "SHINING_3D",
  "NEOSCAN_1000",
  "UNKNOWN",
  "UNKNOWN_DESK",
] as const;
export type ScannerTreatment = (typeof SCANNER_TREATMENTS)[number];

/** OA's scanner-platform enum `bZ` (rules "Enums" `bZ`), sent as the NAME — the cloud the scan is shared through. */
export const SCANNER_PLATFORMS = [
  "SHAPE_COMMUNICATE",
  "SIRONA_CONNECT",
  "ITERO_RESTAURATIVE",
  "CSCONNECT",
  "MEDIT_LINK",
  "DWOS_CONNECT",
  "HERON_CLOUD",
  "ROMEXIS_CLOUD",
  "SHINING_3D_DENTAL_CLOUD",
  "DEXIS_IS",
] as const;
export type ScannerPlatform = (typeof SCANNER_PLATFORMS)[number];

/**
 * How the bite reaches the lab (OA's "Registro dental", rules §1.5): a
 * physical impression, a scanner, or a scanner platform. OA keeps only one of
 * scanner/platform (choosing one nulls the other). The name is null while the
 * doctor hasn't picked one yet; the rules then answer "required".
 */
export type Registration =
  | { method: "impression" }
  | { method: "scanner"; scannerTreatment: ScannerTreatment | null }
  | { method: "platform"; scannerPlatform: ScannerPlatform | null };

/** Warnings the doctor must confirm before the order can be sent (Łukasz D1, 2026-10-03). */
export const CONFIRMABLE_WARNINGS = ["advanceUnder5"] as const;
export type ConfirmableWarning = (typeof CONFIRMABLE_WARNINGS)[number];

export type VerticalDimension = { kind: "registro" } | { kind: "minimal" } | { kind: "mm"; value: number };

export interface DeviceOrder {
  /** Our practitioner id — the doctor who orders. Delivery goes to their primary HCO (NEO-213). */
  dentistId: string;
  productCode: ProductCode;
  /** MR / MP in mm (OA retrusionMax / protrusionMax). */
  retrusionMaxMm: number;
  protrusionMaxMm: number;
  /** Starting point as the doctor typed it; the adapter sends OA mm only (rules §8.10). */
  startingPoint: { unit: SequenceUnit; value: number | null };
  sequence: Sequence;
  deviation: { rightMm: number; rightAdvanceMm: number; leftMm: number; leftAdvanceMm: number };
  /** A flag on the NOA order, priced as an add-on — never a second order (Łukasz D1, rules §8.14). */
  morningAligner: boolean;
  verticalDimension: VerticalDimension;
  anteriorFrontalOpening: boolean;
  slotsForElasticBands: boolean;
  /** 0–5, OA default 3. */
  laterality: number | null;
  /** 0–12, OA default 7. */
  limitOpening: number | null;
  /** Band designs 1–6, OA default 3. */
  upperBand: number;
  lowerBand: number;
  finish: "mixed" | "scalloped";
  /** FDI tooth → state; teeth not listed are "regular". */
  teeth: Record<string, ToothState>;
  observations: string;
  /** YYYY-MM-DD; must not be before OA's manufacturing date for the product. */
  desiredDate: string;
  noContactDoctorForRedesign: boolean;
  /** How the bite reaches the lab; sent to OA as scannerTreatment / scannerPlatform. Missing → impression. */
  registration: Registration;
  /**
   * Warning codes the doctor confirmed (e.g. "advanceUnder5"). A confirmable
   * warning not listed here blocks the order (warningNotConfirmed). Missing → []
   * (old drafts and clients).
   */
  acknowledgedWarnings: string[];
}

/** Where the device ships: the ordering doctor's primary HCO (NEO-213). OA requires every field (KJ, rules §1.2). */
export interface DeliveryAddress {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  email: string;
}

export function defaultDeviceOrder(dentistId = ""): DeviceOrder {
  return {
    dentistId,
    productCode: PRODUCT_CODES.NOA,
    retrusionMaxMm: 0,
    protrusionMaxMm: 0,
    startingPoint: { unit: "mm", value: null },
    sequence: { type: "standard" },
    deviation: { rightMm: 0, rightAdvanceMm: 0, leftMm: 0, leftAdvanceMm: 0 },
    morningAligner: false,
    verticalDimension: { kind: "registro" },
    anteriorFrontalOpening: false,
    slotsForElasticBands: false,
    laterality: 3,
    limitOpening: 7,
    upperBand: 3,
    lowerBand: 3,
    finish: "mixed",
    teeth: {},
    observations: "",
    desiredDate: "",
    noContactDoctorForRedesign: false,
    registration: { method: "impression" },
    acknowledgedWarnings: [],
  };
}
