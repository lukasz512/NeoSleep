import {
  FDI_TEETH,
  mainSplintCount,
  roundMm,
  startingPointMm,
  type DeliveryAddress,
  type DeviceOrder,
  type Registration,
  type ScannerPlatform,
  type ScannerTreatment,
  type ToothState,
  type VerticalDimension,
} from "@neo/device-order";

/**
 * Our DeviceOrder → OrthoApnea's treatment DTO, the exact shape OA's portal
 * builds (populateTreatmentDTO, docs/partners/orthoapnea-order-rules.md §3.2)
 * and that OA accepted and stored field for field as order 454012 (shot S3,
 * 2026-10-03). Pure: every OA-side object comes in through `ctx`, so the
 * contract test can pin it against the captured request
 * (test/oa-replica/fixtures/treatment-create-full.request.json).
 */

/** The shared account as GET /api/user/me returns it — only the keys the DTO needs. */
export interface OaMe {
  id: number;
  fsDoctorId?: number;
  customers?: { id: number; name: string }[];
}

export interface OaTreatmentContext {
  /** The OA patient (id from POST /api/patient) and the name it was created with. */
  patient: { id: number; name: string };
  /** The full ClinicDTO from GET /api/clinics — OA's DTO carries the whole object. */
  clinic: Record<string, unknown>;
  /** The full product object from GET /api/products — same. */
  product: Record<string, unknown>;
  me: OaMe;
  /** Where the device ships: the ordering doctor's primary HCO (Łukasz, 2026-10-03). */
  delivery: DeliveryAddress;
  /** ISO2 → OA country id (GET /api/countries); null when OA doesn't list the country. */
  countryIdByIso: (iso: string) => number | null;
  /** Today as YYYY-MM-DD — OA overwrites requestDate with server time anyway. */
  today: string;
}

/** OA's date format: "YYYY-MM-DDT00:00:00" (rules §1.1 `hr()`). */
export function oaDate(isoDay: string): string {
  return `${isoDay.slice(0, 10)}T00:00:00`;
}

/** Vertical dimension: OA codes "registro" as 1000 and "minimal" as 2000; otherwise the mm value (rules §3.2). */
export function oaVerticalDimension(vd: VerticalDimension): number {
  if (vd.kind === "registro") return 1000;
  if (vd.kind === "minimal") return 2000;
  return vd.value;
}

const QUADRANT_KEYS = ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const;

/**
 * Teeth → OA's teethStatus JSON string (rules §1.7): FDI quadrant 1 = topLeft,
 * 2 = topRight, 3 = bottomLeft, 4 = bottomRight; array index = tooth digit − 1;
 * unlisted teeth are "regular". OA's form sends "" when the doctor never
 * touched the teeth, so an all-regular mouth is sent as "" too.
 */
export function oaTeethStatus(teeth: Record<string, ToothState>): string {
  const marked = Object.entries(teeth).filter(([tooth, state]) => FDI_TEETH.includes(tooth) && state !== "regular");
  if (marked.length === 0) return "";
  const status: Record<(typeof QUADRANT_KEYS)[number], ToothState[]> = {
    topLeft: Array<ToothState>(8).fill("regular"),
    topRight: Array<ToothState>(8).fill("regular"),
    bottomLeft: Array<ToothState>(8).fill("regular"),
    bottomRight: Array<ToothState>(8).fill("regular"),
  };
  for (const [tooth, state] of marked) {
    const quadrant = QUADRANT_KEYS[Number(tooth[0]) - 1]!;
    status[quadrant][Number(tooth[1]) - 1] = state;
  }
  return JSON.stringify(status);
}

/**
 * Sequence → OA's three flags plus `sequence` (rules §3.2 `gT`). Standard is
 * `{}` in mm units. Personalized: the main splints go to seq1..seq3 (seq1..seq2
 * for NOA TMJ), additional splints to seq4..seq6; only non-empty values are
 * sent, as numbers.
 */
export function oaSequence(order: Pick<DeviceOrder, "sequence" | "productCode">): {
  sequenceTypeStandard: boolean;
  sequenceTypePersonalized: boolean;
  sequenceUnitInMM: boolean;
  sequence: Record<string, number>;
} {
  const seq = order.sequence;
  if (seq.type === "standard") {
    return { sequenceTypeStandard: true, sequenceTypePersonalized: false, sequenceUnitInMM: true, sequence: {} };
  }
  const sequence: Record<string, number> = {};
  seq.values.slice(0, mainSplintCount(order.productCode)).forEach((value, i) => {
    if (value !== null) sequence[`seq${i + 1}`] = value;
  });
  seq.additionalSplints.slice(0, 3).forEach((value, i) => {
    sequence[`seq${i + 4}`] = value;
  });
  return { sequenceTypeStandard: false, sequenceTypePersonalized: true, sequenceUnitInMM: seq.unit === "mm", sequence };
}

/**
 * Registration → OA's scannerTreatment / scannerPlatform, as enum NAMES
 * (rules "Enums" `ba` / `bZ`). OA keeps only one: choosing a platform nulls
 * the scanner and vice versa; an impression sends both null (order 454012).
 */
export function oaRegistration(registration: Registration): {
  scannerTreatment: ScannerTreatment | null;
  scannerPlatform: ScannerPlatform | null;
} {
  if (registration.method === "scanner") return { scannerTreatment: registration.scannerTreatment, scannerPlatform: null };
  if (registration.method === "platform") return { scannerTreatment: null, scannerPlatform: registration.scannerPlatform };
  return { scannerTreatment: null, scannerPlatform: null };
}

/** `user` / `creator` as OA's portal sends them: only the id is real. */
function oaUserRef(id: number) {
  return { id, name: "", email: "", identityNumber: "", role: "", signupDate: null };
}

/** The `t1` address defaults OA's portal adds to every address object (rules §3.2). */
const OA_ADDRESS_DEFAULTS = {
  sendEmail: false,
  sendSms: false,
  sms: "",
  pickFrom1: "",
  pickUntil1: "",
  pickFrom2: "",
  pickUntil2: "",
  deliveryFrom: "",
  addressObservations: "",
  contact: "",
  type: 0,
};

export function toOaTreatmentDto(order: DeviceOrder, ctx: OaTreatmentContext): Record<string, unknown> {
  const startingPoint = startingPointMm(order);
  if (startingPoint === null) throw new Error("toOaTreatmentDto: the order has no starting point — validate it first");
  const countryId = ctx.countryIdByIso(ctx.delivery.countryCode);
  if (countryId === null) throw new Error(`toOaTreatmentDto: OrthoApnea has no country '${ctx.delivery.countryCode}'`);

  const customer = ctx.me.customers?.[0];
  const desiredDate = oaDate(order.desiredDate);

  return {
    id: 0,
    // The invoice customer is the shared account's own (OA's form requires a validated one).
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? "",
    customerCountryId: 0,
    user: oaUserRef(ctx.me.id),
    creator: oaUserRef(ctx.me.id),
    clinic: ctx.clinic,
    product: ctx.product,
    patientName: ctx.patient.name,
    patientId: ctx.patient.id,
    // OA's portal sends 3 and OA stores 1 (shot S3) — sent as the portal does.
    statusId: 3,
    lastActivity: null,
    desiredDate,
    expectedDeliveryDate: desiredDate,
    requestDate: oaDate(ctx.today),
    teethStatus: oaTeethStatus(order.teeth),
    observations: order.observations,
    multimedias: [],
    collectionRequest: false,
    // Always an object; active:true = ship to this address, which is always
    // the ordering doctor's primary HCO (Łukasz, 2026-10-03, NEO-213).
    deliveryAddress: {
      name: ctx.delivery.name.trim(),
      address: ctx.delivery.address.trim(),
      city: ctx.delivery.city.trim(),
      // Province is required only for CA/ES/DE/US (rules §7); not collected for MX.
      province: "",
      countryId,
      postalCode: ctx.delivery.postalCode.trim(),
      phone: ctx.delivery.phone.trim(),
      email: ctx.delivery.email.trim(),
      active: true,
      ...OA_ADDRESS_DEFAULTS,
    },
    // Never sent: the wizard has no promotion-code field (Łukasz D2, 2026-10-03).
    promotionCode: null,
    camType: false,
    verticalDimension: oaVerticalDimension(order.verticalDimension),
    retrusionMax: roundMm(order.retrusionMaxMm),
    protrusionMax: roundMm(order.protrusionMaxMm),
    // Always mm: OA has no percentage field (startingPointPorcentage is never sent, rules §8.10).
    startingPoint,
    theramonNeeded: false,
    maxOpening: 0,
    ...oaSequence(order),
    // Facial biotype is shown only for DE customers; OA's default.
    facialBiotype: "1",
    deviationRight: order.deviation.rightMm,
    deviationAdvanceRight: order.deviation.rightAdvanceMm,
    deviationLeft: order.deviation.leftMm,
    deviationAdvanceLeft: order.deviation.leftAdvanceMm,
    laterality: order.laterality,
    limitOpening: order.limitOpening,
    anteriorFrontalOpening: order.anteriorFrontalOpening,
    mixedSplintDesign: order.finish === "mixed",
    scallopedSplintDesign: order.finish === "scalloped",
    slotsForElasticBands: order.slotsForElasticBands,
    upperBandSplintDesign: order.upperBand,
    lowerBandSplintDesign: order.lowerBand,
    ...oaRegistration(order.registration),
    fsDoctorId: ctx.me.fsDoctorId ?? 0,
    workSheets: [],
    techObservations: "",
    parentTreatmentId: "",
    archived: false,
    estimate: false,
    // A flag on the NOA order, priced as an add-on (+148 on 454012) — never a second order (rules §8.14).
    morningAligner: order.morningAligner,
    noContactDoctorForRedesign: order.noContactDoctorForRedesign,
    accessories: { quantity: 0 },
    editable: true,
    invoiceId: null,
    paid: false,
    billed: false,
  };
}
