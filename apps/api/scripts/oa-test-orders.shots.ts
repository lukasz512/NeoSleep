/**
 * The numbered live OrthoApnea test orders (NEO-210), run by oa-test-order.ts.
 * Each shot is chosen to answer as many open questions as possible: an order
 * going through is already known, what we need are OA's rules, formats and
 * error shapes (docs/partners/orthoapnea-order-rules.md, "Open questions").
 *
 * "OA-faithful" = the exact DTO OA's own portal builds (populateTreatmentDTO,
 * sent as multipart `treatmentDTO`); "as-is" = what our app sends today.
 * Every patient is "Tester Patient N", every order says it is a test.
 */

export const PATIENT_PLACEHOLDER = "<OA patient id from step 1>";

export interface ShotContext {
  product: (code: string) => Record<string, unknown>;
  country: (iso: string) => { id: number; code: string };
  clinic: Record<string, unknown>;
  me: Record<string, unknown>;
  minDate: unknown;
}

export interface Shot {
  n: number;
  purpose: string;
  /** The open questions this shot answers — copied into the plan Łukasz approves. */
  learns: string[];
  transport: "json" | "multipart";
  patient: (ctx: ShotContext) => Record<string, unknown>;
  treatment: (ctx: ShotContext, patientId: number | string) => Record<string, unknown>;
}

const NOA = "002";

const observations = (n: number) =>
  `PEDIDO DE PRUEBA ${n} – NeoSleep, Łukasz Ostrowski. NO FABRICAR, NO FACTURAR, NO ENVIAR. Prueba técnica de integración; se cancelará.`;

/** OA dates are "YYYY-MM-DDT00:00:00"; the minimum comes from GET /api/products/manufacturingDate. */
function oaDate(value: unknown, fallbackDaysAhead = 15): string {
  // Already OA's own format ("2026-10-19T00:00:00") — keep the date as is; parsing it would shift it by the local offset.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return `${value.slice(0, 10)}T00:00:00`;
  const parsed = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  const d = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + fallbackDaysAhead * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T00:00:00`;
}

const today = () => `${new Date().toISOString().slice(0, 10)}T00:00:00`;

/** Patient as OA's own create-patient form sends it (birthDate + country are required there). */
function oaPatient(ctx: ShotContext, n: number): Record<string, unknown> {
  return {
    name: `Tester Patient ${n}`,
    email: "",
    identityNumber: "",
    insuranceNumber: "",
    birthDate: "1980-01-01T00:00:00",
    male: "",
    phone: "",
    countryId: ctx.country("MX").id,
    province: "",
    city: "",
    address: "",
    postalCode: "",
    userId: ctx.me.id,
    profession: "",
  };
}

const userRef = (ctx: ShotContext) => ({ id: ctx.me.id, name: "", email: "", identityNumber: "", role: "", signupDate: null });

const ADDRESS_DEFAULTS = {
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

const CLINIC_ADDRESS = { name: "", address: "", city: "", province: "", countryId: "", postalCode: "", phone: "", email: "", active: false, ...ADDRESS_DEFAULTS };

/** The DTO OA's portal builds for a new NOA order (harvest §3.2), with per-shot overrides on top. */
function oaTreatment(ctx: ShotContext, patientId: number | string, n: number, overrides: Record<string, unknown> = {}) {
  const desired = oaDate(ctx.minDate);
  // The invoice customer is the shared account's own (OA's form requires a validated one).
  const customer = (ctx.me.customers as { id: number; name: string }[] | undefined)?.[0];
  return {
    id: 0,
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? "",
    customerCountryId: 0,
    user: userRef(ctx),
    creator: userRef(ctx),
    clinic: ctx.clinic,
    product: ctx.product(NOA),
    patientName: `Tester Patient ${n}`,
    patientId,
    statusId: 3,
    lastActivity: null,
    desiredDate: desired,
    expectedDeliveryDate: desired,
    requestDate: today(),
    teethStatus: "",
    observations: observations(n),
    multimedias: [],
    collectionRequest: false,
    deliveryAddress: CLINIC_ADDRESS,
    promotionCode: null,
    camType: false,
    verticalDimension: 1000,
    retrusionMax: -5,
    protrusionMax: 5,
    startingPoint: 0,
    theramonNeeded: false,
    maxOpening: 0,
    sequenceTypeStandard: true,
    sequenceTypePersonalized: false,
    sequenceUnitInMM: true,
    sequence: {},
    facialBiotype: "1",
    deviationRight: 0,
    deviationAdvanceRight: 0,
    deviationLeft: 0,
    deviationAdvanceLeft: 0,
    laterality: null,
    limitOpening: null,
    anteriorFrontalOpening: false,
    mixedSplintDesign: true,
    scallopedSplintDesign: false,
    slotsForElasticBands: false,
    upperBandSplintDesign: 3,
    lowerBandSplintDesign: 3,
    scannerPlatform: null,
    scannerTreatment: null,
    fsDoctorId: ctx.me.fsDoctorId ?? 0,
    workSheets: [],
    techObservations: "",
    parentTreatmentId: "",
    archived: false,
    estimate: false,
    morningAligner: false,
    noContactDoctorForRedesign: false,
    accessories: { quantity: 0 },
    editable: true,
    invoiceId: null,
    paid: false,
    billed: false,
    ...overrides,
  };
}

export const SHOTS: Shot[] = [
  {
    n: 1,
    purpose: "What our app sends today (JSON, our field names), plus only the missing patient link",
    learns: [
      "Does POST /api/treatments accept a JSON body at all, or only multipart?",
      "Does OA reject unknown keys (addressSend, startingPointPorcentage, additionalSplints) or wrong types (teethStatus array, verticalDimension text, clinic as a number, product as {id})?",
      "OA's error response: status code + body shape (what our form must map)",
      "Is a patient without birthDate/country accepted (our current patient payload)?",
    ],
    transport: "json",
    patient: (ctx) => ({
      name: "Tester Patient 1",
      email: "",
      identityNumber: "",
      insuranceNumber: "",
      birthDate: "",
      male: "",
      phone: "",
      countryId: ctx.country("MX").id,
      province: "",
      city: "",
      address: "",
      postalCode: "",
      userId: ctx.me.id,
      profession: "",
    }),
    treatment: (ctx, patientId) => ({
      patientId,
      patientName: "Tester Patient 1",
      clinic: ctx.clinic.id,
      addressSend: "clinic",
      deliveryAddress: null,
      product: { id: ctx.product(NOA).id },
      retrusionMax: -5,
      protrusionMax: 5,
      deviationRight: 0,
      deviationLeft: 0,
      deviationAdvanceRight: 0,
      deviationAdvanceLeft: 0,
      startingPointPorcentage: 50,
      startingPoint: null,
      sequenceTypeStandard: false,
      sequenceTypePersonalized: true,
      sequenceUnitInMM: false,
      sequence: { seq1: 60, seq2: 70, seq3: 80 },
      morningAligner: false,
      verticalDimension: "registro",
      anteriorFrontalOpening: false,
      slotsForElasticBands: false,
      upperBandSplintDesign: "3",
      lowerBandSplintDesign: "3",
      mixedSplintDesign: true,
      scallopedSplintDesign: false,
      additionalSplints: ["1"],
      teethStatus: ["16"],
      observations: observations(1),
      desiredDate: oaDate(ctx.minDate).slice(0, 10),
      noContactDoctorForRedesign: false,
    }),
  },
  {
    n: 2,
    purpose: "OA-faithful minimal NOA order (multipart, standard sequence, ships to the clinic)",
    learns: [
      "The reference good order: response shape (id, patient.id) and the real initial statusId",
      "Is deliveryAddress {active:false} accepted for clinic shipping?",
      "Which of the ~70 keys OA stores as sent and which it rewrites (read-back diff) — the replica's baseline fixture",
    ],
    transport: "multipart",
    patient: (ctx) => oaPatient(ctx, 2),
    treatment: (ctx, patientId) => oaTreatment(ctx, patientId, 2),
  },
  {
    n: 3,
    purpose: "OA-faithful order with every device option filled + alternative MX address + Morning Aligner flag",
    learns: [
      "Personalized sequence in mm with an additional splint in seq4 — stored as sent?",
      "teethStatus JSON string, verticalDimension 2000 (minimal), bands 2/5, scalloped finish, elastic slots, frontal opening, laterality, limit opening, deviation — each echoed?",
      "Alternative address (countryId MX, no province) accepted; does Morning Aligner as a flag on NOA show a price/total change?",
    ],
    transport: "multipart",
    patient: (ctx) => oaPatient(ctx, 3),
    treatment: (ctx, patientId) =>
      oaTreatment(ctx, patientId, 3, {
        retrusionMax: -4,
        protrusionMax: 6,
        startingPoint: 1,
        sequenceTypeStandard: false,
        sequenceTypePersonalized: true,
        sequenceUnitInMM: true,
        sequence: { seq1: 0, seq2: 1, seq3: 2, seq4: 3 },
        teethStatus: JSON.stringify({
          topLeft: ["regular", "regular", "regular", "regular", "regular", "relieve", "regular", "regular"],
          topRight: ["regular", "regular", "regular", "regular", "regular", "crown", "regular", "regular"],
          bottomLeft: ["regular", "regular", "regular", "regular", "regular", "regular", "regular", "regular"],
          bottomRight: ["regular", "regular", "regular", "regular", "regular", "regular", "regular", "regular"],
        }),
        verticalDimension: 2000,
        upperBandSplintDesign: 2,
        lowerBandSplintDesign: 5,
        mixedSplintDesign: false,
        scallopedSplintDesign: true,
        slotsForElasticBands: true,
        anteriorFrontalOpening: true,
        laterality: 2,
        limitOpening: 5,
        deviationRight: 1,
        deviationAdvanceRight: 1,
        morningAligner: true,
        deliveryAddress: {
          name: "PRUEBA Lukasz Ostrowski",
          address: "Calle de Prueba 1, Col. Juarez",
          city: "Ciudad de Mexico",
          province: "",
          countryId: ctx.country("MX").id,
          postalCode: "06600",
          phone: "+525500000000",
          email: "pruebas@neosleepcare.com",
          active: true,
          ...ADDRESS_DEFAULTS,
        },
      }),
  },
  {
    n: 4,
    purpose: "OA-faithful order with an incomplete alternative address (no phone, no postal code) — a rule OA's form blocks",
    learns: [
      "Does OA's server re-check the delivery address, or only their form? (decides whether our check is the only guard)",
      "The error format for a field-level rejection, if any",
    ],
    transport: "multipart",
    patient: (ctx) => oaPatient(ctx, 4),
    treatment: (ctx, patientId) =>
      oaTreatment(ctx, patientId, 4, {
        deliveryAddress: {
          name: "PRUEBA Lukasz Ostrowski",
          address: "Calle de Prueba 1, Col. Juarez",
          city: "Ciudad de Mexico",
          province: "",
          countryId: ctx.country("MX").id,
          postalCode: "",
          phone: "",
          email: "pruebas@neosleepcare.com",
          active: true,
          ...ADDRESS_DEFAULTS,
        },
      }),
  },
  {
    n: 5,
    purpose: "Reserved for the 2026-10-07 demo rehearsal — defined after shots 1-4",
    learns: [],
    transport: "multipart",
    patient: (ctx) => oaPatient(ctx, 5),
    treatment: (ctx, patientId) => oaTreatment(ctx, patientId, 5),
  },
];
