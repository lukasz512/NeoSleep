import { describe, it, expect } from "vitest";
import { DEVICE_ORDER_TONE, deviceOrderState, isActiveDeviceOrder, isDraftTreatmentPlan, treatmentPlanStatusColor, treatmentPlanStatusLabel } from "./treatmentPlanStatus";

describe("treatmentPlanStatus (NEO-153)", () => {
  it("maps statuses to chip colors", () => {
    expect(treatmentPlanStatusColor("completed")).toBe("success");
    expect(treatmentPlanStatusColor("in_progress")).toBe("info");
    expect(treatmentPlanStatusColor("patient_notified")).toBe("info");
    expect(treatmentPlanStatusColor("cancelled")).toBe("default");
    expect(treatmentPlanStatusColor("planned")).toBe("warning");
  });

  it("builds the i18n key in camelCase", () => {
    expect(treatmentPlanStatusLabel((k) => k, "patient_notified")).toBe("app.treatmentPlans.status.patientNotified");
  });

  it("recognises a wizard draft", () => {
    expect(isDraftTreatmentPlan({ metadata: { orthoapneaDraft: true } })).toBe(true);
    expect(isDraftTreatmentPlan({ metadata: null })).toBe(false);
  });
});

describe("deviceOrderState (NEO-217)", () => {
  const base = { status: "initiated", metadata: null, order_sync_status: null, appliance_delivered_at: null } as const;

  it("a wizard draft is 'draft' even if an old link exists", () => {
    expect(deviceOrderState({ ...base, metadata: { orthoapneaDraft: {} } })).toBe("draft");
    expect(deviceOrderState({ ...base, metadata: { orthoapneaDraft: {} }, order_sync_status: "failed" })).toBe("draft");
  });

  it("a failed send needs attention", () => {
    expect(deviceOrderState({ ...base, order_sync_status: "failed" })).toBe("attention");
  });

  it("sent (or legacy, never linked) and not yet delivered is 'ordered'", () => {
    expect(deviceOrderState({ ...base, order_sync_status: "synced" })).toBe("ordered");
    expect(deviceOrderState({ ...base, order_sync_status: "pending" })).toBe("ordered");
    expect(deviceOrderState({ ...base, status: "in_progress", order_sync_status: "synced" })).toBe("ordered");
    expect(deviceOrderState(base)).toBe("ordered");
  });

  it("completed or delivered is 'received'", () => {
    expect(deviceOrderState({ ...base, status: "completed", order_sync_status: "synced" })).toBe("received");
    expect(deviceOrderState({ ...base, appliance_delivered_at: "2026-09-24", order_sync_status: "synced" })).toBe("received");
  });

  it("cancelled wins over everything but a draft", () => {
    expect(deviceOrderState({ ...base, status: "cancelled", order_sync_status: "failed" })).toBe("cancelled");
  });

  it("each state has its rail tone", () => {
    expect(DEVICE_ORDER_TONE).toEqual({ draft: "partial", attention: "attention", ordered: "waiting", received: "done", cancelled: "cancelled" });
  });
});

describe("isActiveDeviceOrder (NEO-223)", () => {
  it("draft, needs attention and ordered are active; received and cancelled are closed", () => {
    expect((["draft", "attention", "ordered", "received", "cancelled"] as const).map(isActiveDeviceOrder))
      .toEqual([true, true, true, false, false]);
  });
});
