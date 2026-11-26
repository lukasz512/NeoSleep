import { describe, it, expect } from "vitest";
import {
  ahiImprovement,
  followUpMonths,
  isAttentionLine,
  nextVisitLine,
  studyResult,
  treatmentSegments,
  treatmentStageLabel,
  type TreatmentProgress,
} from "./clinicalProgress";

const base: TreatmentProgress = {
  stage: "control_1",
  queue: "active",
  needs_action: false,
  overdue: false,
  due_at: null,
  next_visit_at: null,
  delivered_at: null,
  advance_level: null,
  ahi_baseline: null,
  ahi_latest: null,
};

describe("treatmentSegments", () => {
  it("marks the visits before the stage done and the stage's own visit current", () => {
    expect(treatmentSegments("scan")).toEqual(["done", "current", "todo", "todo", "todo"]);
    expect(treatmentSegments("control_1")).toEqual(["done", "done", "done", "current", "todo"]);
    expect(treatmentSegments("follow_up")).toEqual(["done", "done", "done", "done", "done"]);
  });
});

describe("treatmentStageLabel", () => {
  it("names the protocol visit, and the follow-up month when it is the 1/3/6-month control", () => {
    expect(treatmentStageLabel({ stage: "delivery", delivered_at: null, due_at: null })).toEqual({
      key: "app.clinicalQueues.stage.delivery", params: { visit: 3 },
    });
    expect(treatmentStageLabel({ stage: "follow_up", delivered_at: "2026-01-01T00:00:00Z", due_at: "2026-04-01T00:00:00Z" })).toEqual({
      key: "app.clinicalQueues.stage.followUpMonths", params: { months: 3 },
    });
    expect(treatmentStageLabel({ stage: "follow_up", delivered_at: "2026-01-01T00:00:00Z", due_at: "2027-01-01T00:00:00Z" }).key)
      .toBe("app.clinicalQueues.stage.followUpPeriodic");
  });
});

describe("followUpMonths", () => {
  it("is null without dates", () => {
    expect(followUpMonths(null, "2026-01-01")).toBeNull();
  });
});

describe("nextVisitLine", () => {
  it("puts the most urgent thing first", () => {
    expect(nextVisitLine({ ...base, stage: "scan", needs_action: true }, false)).toEqual({ kind: "sendOrder" });
    expect(nextVisitLine({ ...base, stage: "delivery", next_visit_at: "2026-10-09T10:30:00Z" }, true)).toEqual({ kind: "checkOrder" });
    expect(nextVisitLine({ ...base, next_visit_at: "2026-10-09T10:30:00Z" }, false)).toEqual({ kind: "booked", at: "2026-10-09T10:30:00Z" });
    expect(nextVisitLine({ ...base, overdue: true, needs_action: true, due_at: "2026-10-01T00:00:00Z" }, false))
      .toEqual({ kind: "overdue", at: "2026-10-01T00:00:00Z" });
    expect(nextVisitLine({ ...base, needs_action: true, due_at: "2026-10-12T00:00:00Z" }, false))
      .toEqual({ kind: "unbooked", at: "2026-10-12T00:00:00Z" });
    expect(nextVisitLine({ ...base, stage: "follow_up", due_at: "2027-01-01T00:00:00Z" }, false)).toEqual({ kind: "expected", at: "2027-01-01T00:00:00Z" });
    expect(nextVisitLine({ ...base, stage: "done" }, false)).toEqual({ kind: "none" });
  });

  it("flags only what waits on the doctor", () => {
    expect(isAttentionLine({ kind: "overdue", at: "x" })).toBe(true);
    expect(isAttentionLine({ kind: "unbooked", at: null })).toBe(true);
    expect(isAttentionLine({ kind: "booked", at: "x" })).toBe(false);
    expect(isAttentionLine({ kind: "expected", at: "x" })).toBe(false);
  });
});

describe("ahiImprovement", () => {
  it("is the percent drop from the first study to the latest", () => {
    expect(ahiImprovement(31, 6)).toBe(81);
    expect(ahiImprovement(10, 12)).toBe(-20);
    expect(ahiImprovement(null, 6)).toBeNull();
    expect(ahiImprovement(0, 0)).toBeNull();
  });
});

describe("studyResult (D3: numbers shown, severity only after the pulmonologist)", () => {
  it("shows the AHI as pending until the study is interpreted", () => {
    expect(studyResult({ status: "results_received", ahi_score: 34.1 })).toEqual({ kind: "pending", ahi: 34.1 });
    expect(studyResult({ status: "interpreted", ahi_score: 23.4 })).toEqual({ kind: "interpreted", ahi: 23.4, severity: "moderate" });
    expect(studyResult({ status: "device_delivered", ahi_score: null })).toEqual({ kind: "none" });
  });
});
