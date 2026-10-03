import { describe, it, expect } from "vitest";
import {
  compareFields,
  formatEnvTag,
  isTestOrder,
  parseEnvTag,
  reconcileOrders,
  withEnvTag,
  type LocalOrder,
  type RemoteOrder,
} from "./reconcile.js";

const PATHS = ["patientId", "product.code", "retrusionMax", "protrusionMax", "deliveryAddress.city", "deliveryAddress.postalCode", "sequence", "desiredDate"];
const OPTS = { env: "prod" as const, comparedPaths: PATHS, datePaths: ["desiredDate"] };

const PLAN_A = "1a2b3c4d-0000-4000-8000-000000000001";
const PLAN_B = "5e6f7a8b-0000-4000-8000-000000000002";

function sent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientId: 44171,
    product: { code: "002" },
    retrusionMax: -4,
    protrusionMax: 6,
    deliveryAddress: { city: "Ciudad de Mexico", postalCode: "06600" },
    sequence: { seq1: 1, seq2: 3 },
    desiredDate: "2026-10-30T00:00:00",
    ...overrides,
  };
}

function local(planId: string, externalId: string | null, payload: Record<string, unknown> | null = sent(), syncStatus: LocalOrder["syncStatus"] = "synced"): LocalOrder {
  return { treatmentPlanId: planId, patientId: `patient-${planId.slice(0, 4)}`, externalId, syncStatus, sentPayload: payload };
}

function remote(externalId: string, payload: Record<string, unknown> = sent(), extra: Partial<RemoteOrder> = {}): RemoteOrder {
  return { externalId, status: "1", requestDate: "2026-10-03T17:33:29", observations: "", patientName: "Some Patient", payload, ...extra };
}

describe("compareFields", () => {
  it("OA's upper-cased address and trimmed whitespace are not a drift", () => {
    const lab = sent({ deliveryAddress: { city: "CIUDAD  DE MEXICO ", postalCode: "06600" } });
    expect(compareFields(sent(), lab, PATHS, ["desiredDate"])).toEqual([]);
  });

  it("1 and 1.0, '' and null, key order inside objects are not a drift", () => {
    const lab = sent({ retrusionMax: -4.0, protrusionMax: "6.0", sequence: { seq2: 3, seq1: 1.0 } });
    expect(compareFields(sent({ protrusionMax: 6 }), lab, PATHS)).toEqual([]);
    expect(compareFields({ a: "" }, { a: null }, ["a"])).toEqual([]);
  });

  it("dates compare by day only", () => {
    expect(compareFields(sent(), sent({ desiredDate: "2026-10-30" }), PATHS, ["desiredDate"])).toEqual([]);
  });

  it("a changed advance value is a drift, reported as ours vs lab", () => {
    expect(compareFields(sent(), sent({ retrusionMax: -3 }), PATHS)).toEqual([{ field: "retrusionMax", ours: "-4", lab: "-3" }]);
  });

  it("a nested object change names the top path", () => {
    const drift = compareFields(sent(), sent({ sequence: { seq1: 1, seq2: 4 } }), PATHS);
    expect(drift.map((d) => d.field)).toEqual(["sequence"]);
  });
});

describe("environment tag", () => {
  it("round-trips: the tag we write is the tag we read", () => {
    expect(parseEnvTag(withEnvTag("PEDIDO X", "dev", PLAN_A))).toEqual({ env: "dev", ref: "1a2b3c4d" });
    expect(formatEnvTag("prod", PLAN_B)).toBe("[NeoSleep PROD · ref 5e6f7a8b]");
  });

  it("replaces an existing tag instead of stacking a second one", () => {
    const once = withEnvTag("Notes", "dev", PLAN_A);
    const twice = withEnvTag(once, "prod", PLAN_A);
    expect(twice).toBe("Notes\n[NeoSleep PROD · ref 1a2b3c4d]");
  });

  it("an empty note becomes just the tag; no tag reads as null", () => {
    expect(withEnvTag("  ", "local", PLAN_A)).toBe("[NeoSleep LOCAL · ref 1a2b3c4d]");
    expect(parseEnvTag("no tag here")).toBeNull();
    expect(parseEnvTag(null)).toBeNull();
  });
});

describe("isTestOrder", () => {
  it("recognises our live test shots by note or patient name", () => {
    expect(isTestOrder({ observations: "PEDIDO DE PRUEBA 4 – NeoSleep", patientName: null })).toBe(true);
    expect(isTestOrder({ observations: "", patientName: "Tester Patient 3" })).toBe(true);
    expect(isTestOrder({ observations: "Paciente con bruxismo", patientName: "Ana López" })).toBe(false);
  });
});

describe("reconcileOrders", () => {
  it("everything we sent is in the lab unchanged → ok, 100%", () => {
    const r = reconcileOrders([local(PLAN_A, "1"), local(PLAN_B, "2")], [remote("1"), remote("2")], OPTS);
    expect(r.status).toBe("ok");
    expect(r.summary).toMatchObject({ oursSent: 2, labTotal: 2, matched: 2, mismatches: 0, info: 0, matchLevel: 1 });
    expect(r.items.every((i) => i.reason === "matched")).toBe(true);
  });

  it("an order we hold an id for but the lab doesn't list → missing_in_lab", () => {
    const r = reconcileOrders([local(PLAN_A, "1"), local(PLAN_B, "2")], [remote("1")], OPTS);
    expect(r.status).toBe("mismatch");
    expect(r.items.find((i) => i.externalId === "2")).toMatchObject({ reason: "missing_in_lab", treatmentPlanId: PLAN_B });
    expect(r.summary.matchLevel).toBe(0.5);
  });

  it("a field changed in the lab → field_drift with the field named", () => {
    const r = reconcileOrders([local(PLAN_A, "1")], [remote("1", sent({ protrusionMax: 5 }))], OPTS);
    expect(r.status).toBe("mismatch");
    expect(r.items[0]).toMatchObject({ reason: "field_drift", drift: [{ field: "protrusionMax", ours: "6", lab: "5" }] });
  });

  it("the lab's status is reported but never counts as a mismatch", () => {
    const r = reconcileOrders([local(PLAN_A, "1")], [remote("1", sent(), { status: "7" })], OPTS);
    expect(r.status).toBe("ok");
    expect(r.items[0]).toMatchObject({ reason: "matched", labStatus: "7" });
  });

  it("a pending submit (no id yet) needs attention", () => {
    const r = reconcileOrders([local(PLAN_A, null, null, "pending")], [], OPTS);
    expect(r.status).toBe("mismatch");
    expect(r.items[0]!.reason).toBe("submission_pending");
  });

  it("lab-only orders: test shot, other environment, untracked, outside — only untracked is a mismatch", () => {
    const r = reconcileOrders(
      [],
      [
        remote("10", sent(), { observations: "PEDIDO DE PRUEBA 3" }),
        remote("11", sent(), { observations: `x\n${formatEnvTag("dev", PLAN_A)}` }),
        remote("12", sent(), { observations: formatEnvTag("prod", PLAN_B) }),
        remote("13", sent(), { observations: "" }),
      ],
      OPTS
    );
    const reasons = Object.fromEntries(r.items.map((i) => [i.externalId, i.reason]));
    expect(reasons).toEqual({ "10": "test_order", "11": "other_env", "12": "untracked", "13": "outside" });
    expect(r.summary).toMatchObject({ mismatches: 1, info: 3, matchLevel: 0 });
    expect(r.status).toBe("mismatch");
  });

  it("on dev an untagged lab-only order is unknown_env, not 'outside' (default decided 2026-10-03)", () => {
    const r = reconcileOrders([], [remote("13")], { ...OPTS, env: "dev" });
    expect(r.items[0]!.reason).toBe("unknown_env");
    expect(r.status).toBe("ok");
  });

  it("nothing on either side → ok with no match level", () => {
    const r = reconcileOrders([], [], OPTS);
    expect(r).toMatchObject({ status: "ok", summary: { matchLevel: null, oursSent: 0, labTotal: 0 } });
  });

  it("a synced link without a stored payload is matched by id only (no field compare)", () => {
    const r = reconcileOrders([local(PLAN_A, "1", null)], [remote("1", sent({ protrusionMax: 99 }))], OPTS);
    expect(r.items[0]!.reason).toBe("matched");
  });
});
