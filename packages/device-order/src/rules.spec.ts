import { describe, it, expect } from "vitest";
import {
  defaultDeviceOrder,
  parseDeviceOrder,
  PRODUCT_CODES,
  SCANNER_PLATFORMS,
  SCANNER_TREATMENTS,
  standardSequenceOffsets,
  startingPointMm,
  validateDeliveryAddress,
  validateDeviceOrder,
  type DeviceOrder,
} from "./index.js";

/** A complete, valid NOA order — every case below changes one thing. */
function order(patch: Partial<DeviceOrder> = {}): DeviceOrder {
  return {
    ...defaultDeviceOrder("dentist-1"),
    retrusionMaxMm: -5,
    protrusionMaxMm: 5,
    startingPoint: { unit: "mm", value: 0 },
    desiredDate: "2026-10-19",
    ...patch,
  };
}

const codes = (issues: { path: string; code: string }[]) => issues.map((i) => `${i.path}:${i.code}`);

describe("validateDeviceOrder — one table, run identically by the PWA and the API", () => {
  it("accepts a complete NOA order", () => {
    expect(validateDeviceOrder(order())).toEqual({ errors: [], warnings: [] });
  });

  const errorCases: [string, Partial<DeviceOrder>, string[]][] = [
    ["MR and MP both 0 (OA invalidAdvanced)", { retrusionMaxMm: 0, protrusionMaxMm: 0 }, ["protrusionMaxMm:advanceZero"]],
    ["MR not behind MP", { retrusionMaxMm: 3, protrusionMaxMm: 2, startingPoint: { unit: "mm", value: 2 } }, ["retrusionMaxMm:retrusionNotBelowProtrusion"]],
    ["MP above +20 mm (OA Te.max(20))", { protrusionMaxMm: 21 }, ["protrusionMaxMm:outOfRange"]],
    ["MR below −20 mm (OA Te.min(-20))", { retrusionMaxMm: -21 }, ["retrusionMaxMm:outOfRange"]],
    ["SP missing (OA invalidStartPoint)", { startingPoint: { unit: "mm", value: null } }, ["startingPoint.value:required"]],
    ["SP outside MR..MP", { startingPoint: { unit: "mm", value: 6 } }, ["startingPoint.value:startingPointOutside"]],
    ["SP above 100 %", { startingPoint: { unit: "%", value: 120 } }, ["startingPoint.value:outOfRange"]],
    [
      "NOA TMJ personalized without its first splint (OA invalidPersonalizedSequence)",
      { productCode: PRODUCT_CODES.NOA_TMJ, sequence: { type: "personalized", unit: "mm", values: [null, 1], additionalSplints: [] } },
      ["sequence.values.0:personalizedValuesRequired"],
    ],
    [
      "more than 3 additional splints (OA seq4..seq6)",
      { sequence: { type: "personalized", unit: "mm", values: [1, 2, 3], additionalSplints: [4, 5, 6, 7] } },
      ["sequence.additionalSplints:tooManyAdditionalSplints"],
    ],
    ["laterality above 5", { laterality: 6 }, ["laterality:outOfRange"]],
    ["limit opening above 12", { limitOpening: 13 }, ["limitOpening:outOfRange"]],
    ["band design 7", { upperBand: 7 }, ["upperBand:outOfRange"]],
    ["vertical dimension above 20 mm", { verticalDimension: { kind: "mm", value: 21 } }, ["verticalDimension.value:outOfRange"]],
    ["unknown tooth", { teeth: { "99": "crown" } }, ["teeth:invalid"]],
    ["no doctor", { dentistId: "" }, ["dentistId:required"]],
    ["scanner without its scanner (OA scannerTreatment)", { registration: { method: "scanner", scannerTreatment: null } }, ["registration.scannerTreatment:required"]],
    ["platform without its platform (OA scannerPlatform)", { registration: { method: "platform", scannerPlatform: null } }, ["registration.scannerPlatform:required"]],
  ];
  it.each(errorCases)("blocks: %s", (_name, patch, expected) => {
    expect(codes(validateDeviceOrder(order(patch)).errors)).toEqual(expected);
  });

  it("blocks a product the wizard can't order (Morning Aligner alone)", () => {
    expect(codes(validateDeviceOrder({ ...order(), productCode: "004" }).errors)).toEqual(["productCode:invalid"]);
  });

  it("blocks a scanner or platform name OA doesn't know (enums ba / bZ, rules §4)", () => {
    expect(codes(validateDeviceOrder({ ...order(), registration: { method: "scanner", scannerTreatment: "Medit" } }).errors)).toEqual([
      "registration.scannerTreatment:invalid",
    ]);
    expect(codes(validateDeviceOrder({ ...order(), registration: { method: "platform", scannerPlatform: "MEDIT" } }).errors)).toEqual([
      "registration.scannerPlatform:invalid",
    ]);
    expect(codes(validateDeviceOrder({ ...order(), registration: { method: "fax" } }).errors)).toEqual(["registration.method:invalid"]);
  });

  it("accepts every OA scanner and platform name", () => {
    for (const scannerTreatment of SCANNER_TREATMENTS) {
      expect(validateDeviceOrder(order({ registration: { method: "scanner", scannerTreatment } })).errors).toEqual([]);
    }
    for (const scannerPlatform of SCANNER_PLATFORMS) {
      expect(validateDeviceOrder(order({ registration: { method: "platform", scannerPlatform } })).errors).toEqual([]);
    }
    expect(SCANNER_TREATMENTS).toContain("MEDIT");
    expect(SCANNER_PLATFORMS).toContain("MEDIT_LINK");
  });

  it("blocks a desired date before OA's manufacturing date", () => {
    const result = validateDeviceOrder(order({ desiredDate: "2026-10-10" }), { minDesiredDate: "2026-10-19" });
    expect(codes(result.errors)).toEqual(["desiredDate:desiredDateTooEarly"]);
  });

  it("an advance range under 5 mm warns (OA's form) and blocks until the doctor confirms it (Łukasz D1, 2026-10-03)", () => {
    const result = validateDeviceOrder(order({ retrusionMaxMm: -1, protrusionMaxMm: 2 }));
    expect(codes(result.warnings)).toEqual(["protrusionMaxMm:advanceUnder5"]);
    expect(result.errors).toEqual([{ path: "protrusionMaxMm", code: "warningNotConfirmed", params: { warning: "advanceUnder5" } }]);
  });

  it("a confirmed advance under 5 mm only warns — OA's server accepted 3 mm (S4)", () => {
    const result = validateDeviceOrder(order({ retrusionMaxMm: -1, protrusionMaxMm: 2, acknowledgedWarnings: ["advanceUnder5"] }));
    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toEqual(["protrusionMaxMm:advanceUnder5"]);
  });

  it("an acknowledgement with no matching warning is harmless", () => {
    expect(validateDeviceOrder(order({ acknowledgedWarnings: ["advanceUnder5"] }))).toEqual({ errors: [], warnings: [] });
  });

  it("an order without acknowledgedWarnings / registration (old drafts and clients) reads them as [] / impression", () => {
    const { acknowledgedWarnings: _a, registration: _r, ...old } = order();
    expect(validateDeviceOrder(old)).toEqual({ errors: [], warnings: [] });
    expect(parseDeviceOrder(old)).toMatchObject({ acknowledgedWarnings: [], registration: { method: "impression" } });
    const under5 = { ...old, retrusionMaxMm: -1, protrusionMaxMm: 2 };
    expect(codes(validateDeviceOrder(under5).errors)).toEqual(["protrusionMaxMm:warningNotConfirmed"]);
  });

  it("parseDeviceOrder returns null for an order that fails the shape check", () => {
    expect(parseDeviceOrder({ ...order(), upperBand: 9 })).toBeNull();
  });

  it("accepts NOA personalized with three values and three additional splints", () => {
    const sequence = { type: "personalized" as const, unit: "mm" as const, values: [0, 1, 2], additionalSplints: [3, 4, 5] };
    expect(validateDeviceOrder(order({ sequence })).errors).toEqual([]);
  });

  it("still reports another step's cross-field error when an unrelated field fails its shape check", () => {
    const result = validateDeviceOrder(order({ upperBand: 9, startingPoint: { unit: "mm", value: 7 } }));
    expect(codes(result.errors)).toEqual(["upperBand:outOfRange", "startingPoint.value:startingPointOutside"]);
  });

  it("skips a cross-field rule whose own field is malformed instead of guessing", () => {
    const result = validateDeviceOrder({ ...order(), retrusionMaxMm: "x" });
    expect(codes(result.errors)).toEqual(["retrusionMaxMm:invalid"]);
  });

  it("names a missing field as required, not invalid", () => {
    const { dentistId: _omit, ...rest } = order();
    expect(codes(validateDeviceOrder(rest).errors)).toEqual(["dentistId:required"]);
  });
});

describe("starting point and standard sequence (OA's own arithmetic)", () => {
  it("converts SP % to mm as MR + %·(MP − MR)/100, rounded to 0.1", () => {
    expect(startingPointMm(order({ startingPoint: { unit: "%", value: 50 } }))).toBe(0);
    expect(startingPointMm(order({ retrusionMaxMm: -4, protrusionMaxMm: 6, startingPoint: { unit: "%", value: 33 } }))).toBe(-0.7);
  });
  it("keeps SP in mm rounded to 0.1", () => {
    expect(startingPointMm(order({ startingPoint: { unit: "mm", value: 1.26 } }))).toBe(1.3);
  });
  it("standard is SP, −1, +1, +2 for NOA and SP, −1, +1 for NOA TMJ", () => {
    expect(standardSequenceOffsets(PRODUCT_CODES.NOA)).toEqual([-1, 1, 2]);
    expect(standardSequenceOffsets(PRODUCT_CODES.NOA_TMJ)).toEqual([-1, 1]);
  });
});

describe("validateDeliveryAddress — the doctor's HCO must be complete (OA KJ)", () => {
  const hco = {
    name: "Clínica Test",
    address: "Av. Reforma 1",
    city: "Ciudad de México",
    postalCode: "06600",
    countryCode: "MX",
    phone: "+525500000000",
    email: "clinica@example.com",
  };
  it("accepts a complete address", () => {
    expect(validateDeliveryAddress(hco)).toEqual([]);
  });
  it.each([
    ["missing phone", { phone: "" }, "delivery.phone:required"],
    ["missing postal code", { postalCode: " " }, "delivery.postalCode:required"],
    ["bad email", { email: "clinica@" }, "delivery.email:emailInvalid"],
    ["name over 40 characters", { name: "x".repeat(41) }, "delivery.name:tooLong"],
  ])("blocks: %s", (_name, patch, expected) => {
    expect(codes(validateDeliveryAddress({ ...hco, ...patch }))).toEqual([expected]);
  });
  it("lists every missing field when the HCO has no address at all", () => {
    expect(validateDeliveryAddress({ name: "Clínica" }).map((i) => i.path)).toEqual([
      "delivery.address",
      "delivery.city",
      "delivery.postalCode",
      "delivery.countryCode",
      "delivery.phone",
      "delivery.email",
    ]);
  });
});
