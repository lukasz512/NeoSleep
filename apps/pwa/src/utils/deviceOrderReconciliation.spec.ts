import { describe, it, expect } from "vitest";
import { reconciliationView, type LatestReconciliationDto, type ReconciliationItemDto } from "./deviceOrderReconciliation";

function item(reason: ReconciliationItemDto["reason"], externalId: string): ReconciliationItemDto {
  return { reason, externalId, treatmentPlanId: null, patientId: null, patientName: null, labStatus: "1", requestDate: null, drift: [] };
}

const FULL: LatestReconciliationDto = {
  environment: "prod",
  counter: { status: "mismatch", matchLevel: 2 / 3, matched: 2, mismatches: 1, finishedAt: "2026-10-04T13:00:05Z" },
  run: {
    id: "r1",
    trigger: "scheduled",
    status: "mismatch",
    summary: { oursSent: 3, labTotal: 4, matched: 2, mismatches: 1, info: 1, matchLevel: 2 / 3 },
    error: null,
    finished_at: "2026-10-04T13:00:05Z",
    items: [item("matched", "1"), item("matched", "2"), item("field_drift", "3"), item("outside", "4")],
  },
};

describe("reconciliationView", () => {
  it("never run → 'never', nothing listed", () => {
    expect(reconciliationView(null).state).toBe("never");
    expect(reconciliationView({ environment: "dev", counter: null, run: null })).toMatchObject({ state: "never", percent: null, attention: [] });
  });

  it("admin run: rounded %, counts, orders needing a look first, explained ones apart, matched not listed", () => {
    const v = reconciliationView(FULL);
    expect(v).toMatchObject({ state: "mismatch", percent: 67, trigger: "scheduled", counts: { oursSent: 3, labTotal: 4, matched: 2, mismatches: 1, info: 1 } });
    expect(v.attention.map((i) => i.externalId)).toEqual(["3"]);
    expect(v.explained.map((i) => i.externalId)).toEqual(["4"]);
  });

  it("manager (counter only): state and % but no counts or orders", () => {
    const v = reconciliationView({ environment: "prod", counter: FULL.counter });
    expect(v).toMatchObject({ state: "mismatch", percent: 67, counts: null, attention: [], explained: [] });
  });

  it("failed run carries the error; nothing compared means no %", () => {
    const v = reconciliationView({
      environment: "dev",
      counter: { status: "failed", matchLevel: null, matched: 0, mismatches: 0, finishedAt: "2026-10-04T13:00:05Z" },
      run: { id: "r2", trigger: "manual", status: "failed", summary: { oursSent: 1 }, error: "orthoapnea: order list answered 500", finished_at: "x", items: [] },
    });
    expect(v).toMatchObject({ state: "failed", percent: null, error: "orthoapnea: order list answered 500" });
  });
});
