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
  /** Absent = a patient-only shot (no order is placed). */
  treatment?: (ctx: ShotContext, patientId: number | string) => Record<string, unknown>;
  /** Extra POST /api/patient calls after the main one, each read back — to learn OA's patient rules. */
  patientProbes?: (ctx: ShotContext) => Record<string, unknown>[];
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
/**
 * Every field OA's create-patient form has, filled (Łukasz, 2026-10-03: OA
 * links orders to the patient, so they should get as much as we know).
 */
function oaPatient(ctx: ShotContext, n: number): Record<string, unknown> {
  return {
    name: `Tester Patient ${n}`,
    email: TEST_CONTACT.email,
    identityNumber: "",
    insuranceNumber: "",
    birthDate: "1975-06-15T00:00:00",
    male: true,
    phone: TEST_CONTACT.phone,
    countryId: ctx.country("MX").id,
    province: "",
    city: "Ciudad de Mexico",
    address: "Calle de Prueba 1, Col. Juarez",
    postalCode: "06600",
    userId: ctx.me.id,
    profession: "PACIENTE DE PRUEBA",
  };
}

/** NeoSleep's own test contact (Łukasz, 2026-10-03) — never a real patient's. */
const TEST_CONTACT = { email: "lukasz.ostrowski@neosleepcare.com", phone: "+34600854382" };

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
    purpose: "Patient only, no order: every form field filled plus the diagnosis/observations keys OA's patient record has",
    learns: [
      "Which patient fields OA stores (read-back diff), incl. diagnosis/observations that its create form does not show",
      "Does OA's server enforce the unique patient name per doctor, or only its form? (probe: same name again)",
      "The patient error format, if a probe is rejected",
    ],
    transport: "json",
    patient: (ctx) => ({
      ...oaPatient(ctx, 1),
      observations: "PACIENTE DE PRUEBA – NeoSleep, Łukasz Ostrowski. Diagnóstico de prueba: SAOS moderado, IAH 22/h (estudio de sueño de prueba).",
      diagnosis: "SAOS moderado (IAH 22/h) – PRUEBA",
    }),
    patientProbes: (ctx) => [{ ...oaPatient(ctx, 1) }],
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
          phone: TEST_CONTACT.phone,
          email: TEST_CONTACT.email,
          active: true,
          ...ADDRESS_DEFAULTS,
        },
      }),
  },
  {
    n: 4,
    purpose: "OA-faithful order with an advance range of 3 mm (MP − MR < 5), which OA's form only warns about",
    learns: [
      "Does OA's server enforce invalidAdvancedLess5 (MP − MR ≥ 5 mm), or only its form's warning? (decides block vs warning on our side)",
      "The error format for a field-level rejection, if any",
    ],
    transport: "multipart",
    patient: (ctx) => oaPatient(ctx, 4),
    treatment: (ctx, patientId) => oaTreatment(ctx, patientId, 4, { retrusionMax: -1, protrusionMax: 2, startingPoint: 0 }),
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
