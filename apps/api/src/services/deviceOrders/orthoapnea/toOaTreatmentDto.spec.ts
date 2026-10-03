import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  defaultDeviceOrder,
  SCANNER_PLATFORMS,
  SCANNER_TREATMENTS,
  validateDeviceOrder,
  validateDeliveryAddress,
  type DeviceOrder,
  type DeliveryAddress,
} from "@neo/device-order";
import { oaRegistration, oaSequence, oaTeethStatus, oaVerticalDimension, toOaTreatmentDto, type OaTreatmentContext } from "./toOaTreatmentDto.js";
import { ENV_TAG_APPROVED, toRemoteOrder } from "./provider.js";
import { parseEnvTag } from "../reconcile.js";

const FIXTURES = new URL("../../../../test/oa-replica/fixtures/", import.meta.url);
const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")) as T;

/** The DTO OA accepted and stored field for field as order 454012 (shot S3, 2026-10-03), scrubbed. */
const acceptedDto = fixture<Record<string, unknown>>("treatment-create-full.request.json");
const countries = fixture<{ id: number; code: string }[]>("countries.response.json");
const clinics = fixture<Record<string, unknown>[]>("clinics.response.json");

/** Shot S3 in our own words: the order a doctor would fill in the wizard to produce that DTO. */
const shot3Order: DeviceOrder = {
  dentistId: "00000000-0000-4000-8000-000000000001",
  productCode: "002",
  retrusionMaxMm: -4,
  protrusionMaxMm: 6,
  startingPoint: { unit: "mm", value: 1 },
  sequence: { type: "personalized", unit: "mm", values: [0, 1, 2], additionalSplints: [3] },
  deviation: { rightMm: 1, rightAdvanceMm: 1, leftMm: 0, leftAdvanceMm: 0 },
  morningAligner: true,
  verticalDimension: { kind: "minimal" },
  anteriorFrontalOpening: true,
  slotsForElasticBands: true,
  laterality: 2,
  limitOpening: 5,
  upperBand: 2,
  lowerBand: 5,
  finish: "scalloped",
  teeth: { "16": "relieve", "26": "crown" },
  observations: acceptedDto.observations as string,
  desiredDate: "2026-10-19",
  noContactDoctorForRedesign: false,
  // Order 454012 went with scannerPlatform / scannerTreatment null: an impression.
  registration: { method: "impression" },
  acknowledgedWarnings: [],
};

const sentAddress = acceptedDto.deliveryAddress as Record<string, string>;
const shot3Delivery: DeliveryAddress = {
  name: sentAddress.name!,
  address: sentAddress.address!,
  city: sentAddress.city!,
  postalCode: sentAddress.postalCode!,
  countryCode: "MX",
  phone: sentAddress.phone!,
  email: sentAddress.email!,
};

const shot3Context: OaTreatmentContext = {
  patient: { id: acceptedDto.patientId as number, name: acceptedDto.patientName as string },
  clinic: clinics[0]!,
  product: acceptedDto.product as Record<string, unknown>,
  me: { id: 15682, fsDoctorId: 46355, customers: [{ id: 20796, name: "SHARED ACCOUNT DOCTOR" }] },
  delivery: shot3Delivery,
  countryIdByIso: (iso) => countries.find((c) => c.code === iso)?.id ?? null,
  today: "2026-10-03",
};

/**
 * Keys left out of the deep comparison, and why. Everything else must match
 * the accepted DTO exactly.
 * - clinic / product / me-derived refs: these are OA's own objects passed
 *   through untouched (ctx.clinic comes from clinics.response.json, scrubbed
 *   separately from the request capture) — compared on their own below.
 */
const PASSED_THROUGH = ["clinic", "product"] as const;

function without(dto: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(dto).filter(([k]) => !keys.includes(k)));
}

describe("toOaTreatmentDto — contract against the DTO OrthoApnea accepted (order 454012)", () => {
  it("the shot-3 order is valid under the shared rules", () => {
    expect(validateDeviceOrder(shot3Order, { minDesiredDate: "2026-10-19" }).errors).toEqual([]);
    expect(validateDeliveryAddress(shot3Delivery)).toEqual([]);
  });

  it("produces the accepted DTO key for key (dates pinned through ctx.today / order.desiredDate)", () => {
    const dto = toOaTreatmentDto(shot3Order, shot3Context);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(acceptedDto).sort());
    expect(without(dto, PASSED_THROUGH)).toEqual(without(acceptedDto, PASSED_THROUGH));
  });

  it("passes OA's clinic and product objects through whole (OA's DTO carries the full objects)", () => {
    const dto = toOaTreatmentDto(shot3Order, shot3Context);
    expect(dto.clinic).toBe(shot3Context.clinic);
    expect(dto.product).toBe(shot3Context.product);
    // The scrubbed clinic capture and the clinic inside the accepted request are the same object.
    expect(dto.clinic).toEqual(acceptedDto.clinic);
  });

  it("never sends startingPointPorcentage, additionalSplints or any other key OA doesn't have", () => {
    const dto = toOaTreatmentDto({ ...shot3Order, startingPoint: { unit: "%", value: 50 } }, shot3Context);
    expect(dto).not.toHaveProperty("startingPointPorcentage");
    expect(dto).not.toHaveProperty("additionalSplints");
    expect(dto.startingPoint).toBe(1); // -4 + 50% of 10 mm
  });
});

describe("toOaTreatmentDto — field mappings", () => {
  it("teeth: FDI quadrant 1..4 → topLeft/topRight/bottomLeft/bottomRight, index = tooth digit − 1", () => {
    const status = JSON.parse(oaTeethStatus({ "11": "crown", "28": "missing", "31": "implant", "47": "bridge" })) as Record<string, string[]>;
    expect(Object.keys(status)).toEqual(["topLeft", "topRight", "bottomLeft", "bottomRight"]);
    expect(status.topLeft![0]).toBe("crown");
    expect(status.topRight![7]).toBe("missing");
    expect(status.bottomLeft![0]).toBe("implant");
    expect(status.bottomRight![6]).toBe("bridge");
    expect(status.topLeft!.filter((s) => s !== "regular")).toHaveLength(1);
    expect(Object.values(status).every((q) => q.length === 8)).toBe(true);
  });

  it('teeth: untouched or all "regular" → "" (what OA\'s form sends when the doctor never marks a tooth)', () => {
    expect(oaTeethStatus({})).toBe("");
    expect(oaTeethStatus({ "11": "regular" })).toBe("");
  });

  it("sequence: standard → {} in mm units", () => {
    expect(oaSequence(defaultDeviceOrder())).toEqual({
      sequenceTypeStandard: true,
      sequenceTypePersonalized: false,
      sequenceUnitInMM: true,
      sequence: {},
    });
  });

  it("sequence: personalized → seq1..3 (empty skipped), additional splints → seq4..6, unit from the order", () => {
    expect(
      oaSequence({ productCode: "002", sequence: { type: "personalized", unit: "%", values: [10, null, 60], additionalSplints: [70, 80] } })
    ).toEqual({
      sequenceTypeStandard: false,
      sequenceTypePersonalized: true,
      sequenceUnitInMM: false,
      sequence: { seq1: 10, seq3: 60, seq4: 70, seq5: 80 },
    });
  });

  it("sequence: NOA TMJ has two main splints only — a third value is not sent", () => {
    expect(
      oaSequence({ productCode: "003", sequence: { type: "personalized", unit: "mm", values: [0, 1, 2], additionalSplints: [] } }).sequence
    ).toEqual({ seq1: 0, seq2: 1 });
  });

  it("vertical dimension: registro 1000, minimal 2000, otherwise the mm value", () => {
    expect(oaVerticalDimension({ kind: "registro" })).toBe(1000);
    expect(oaVerticalDimension({ kind: "minimal" })).toBe(2000);
    expect(oaVerticalDimension({ kind: "mm", value: 4.5 })).toBe(4.5);
  });

  it("finish: mixed → mixedSplintDesign only", () => {
    const dto = toOaTreatmentDto({ ...shot3Order, finish: "mixed" }, shot3Context);
    expect(dto.mixedSplintDesign).toBe(true);
    expect(dto.scallopedSplintDesign).toBe(false);
  });

  it("delivery always ships to the HCO: active:true with OA's address defaults and the HCO's country id", () => {
    const dto = toOaTreatmentDto(shot3Order, shot3Context);
    expect(dto.deliveryAddress).toMatchObject({ active: true, countryId: 29, province: "", type: 0, sendSms: false });
  });

  it("registration: impression → scannerTreatment and scannerPlatform both null (order 454012)", () => {
    const dto = toOaTreatmentDto(shot3Order, shot3Context);
    expect(dto).toMatchObject({ scannerTreatment: null, scannerPlatform: null });
    expect(oaRegistration({ method: "impression" })).toEqual({ scannerTreatment: null, scannerPlatform: null });
  });

  it("registration: a scanner is sent as OA's enum name, the platform nulled (OA nulls the other one)", () => {
    const dto = toOaTreatmentDto({ ...shot3Order, registration: { method: "scanner", scannerTreatment: "MEDIT" } }, shot3Context);
    expect(dto).toMatchObject({ scannerTreatment: "MEDIT", scannerPlatform: null });
  });

  it("registration: a platform is sent as OA's enum name, the scanner nulled", () => {
    const dto = toOaTreatmentDto({ ...shot3Order, registration: { method: "platform", scannerPlatform: "MEDIT_LINK" } }, shot3Context);
    expect(dto).toMatchObject({ scannerPlatform: "MEDIT_LINK", scannerTreatment: null });
  });

  it("registration: every scanner / platform name maps 1:1 (no label ever reaches OA)", () => {
    for (const name of SCANNER_TREATMENTS) expect(oaRegistration({ method: "scanner", scannerTreatment: name }).scannerTreatment).toBe(name);
    for (const name of SCANNER_PLATFORMS) expect(oaRegistration({ method: "platform", scannerPlatform: name }).scannerPlatform).toBe(name);
  });

  it("never sends a promotion code — the wizard has no promo field (Łukasz D2, 2026-10-03)", () => {
    const dto = toOaTreatmentDto(shot3Order, shot3Context);
    expect(dto.promotionCode).toBeNull();
    expect(acceptedDto.promotionCode).toBeNull();
  });

  it("never sends acknowledgedWarnings or registration as keys of their own (OA has no such fields)", () => {
    const dto = toOaTreatmentDto({ ...shot3Order, acknowledgedWarnings: ["advanceUnder5"] }, shot3Context);
    expect(dto).not.toHaveProperty("acknowledgedWarnings");
    expect(dto).not.toHaveProperty("registration");
  });

  it("refuses to build a DTO for a country OA doesn't list (it would reach OA without a country)", () => {
    expect(() => toOaTreatmentDto(shot3Order, { ...shot3Context, delivery: { ...shot3Delivery, countryCode: "ZZ" } })).toThrow(/country/);
  });
});

describe("toOaTreatmentDto — environment tag (NEO-218)", () => {
  const planId = "1a2b3c4d-0000-4000-8000-000000000001";

  it("with envTag, the notes end with the tag line the reconciliation reads back", () => {
    const dto = toOaTreatmentDto(shot3Order, { ...shot3Context, envTag: { env: "dev", treatmentPlanId: planId } });
    expect(dto.observations).toBe(`${shot3Order.observations}\n[NeoSleep DEV · ref 1a2b3c4d]`);
    expect(parseEnvTag(dto.observations as string)).toEqual({ env: "dev", ref: "1a2b3c4d" });
  });

  it("without envTag (until Łukasz approves the wording), the notes go exactly as written", () => {
    expect(ENV_TAG_APPROVED).toBe(false);
    expect(toOaTreatmentDto(shot3Order, shot3Context).observations).toBe(shot3Order.observations);
  });
});

describe("toRemoteOrder — OA's order list entry → what the reconciliation reads", () => {
  it("maps id, status, notes and patient name from OA's stored DTO for 454012", () => {
    const stored = fixture<Record<string, unknown>>("treatment-dto-full.response.json");
    const remote = toRemoteOrder(stored);
    expect(remote).toMatchObject({ externalId: String(stored.id), status: String(stored.statusId), observations: stored.observations });
    expect(remote.payload).toBe(stored);
  });
});
