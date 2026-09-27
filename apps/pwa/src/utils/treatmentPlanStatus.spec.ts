import { describe, it, expect } from "vitest";
import { isDraftTreatmentPlan, treatmentPlanStatusColor, treatmentPlanStatusLabel } from "./treatmentPlanStatus";

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
