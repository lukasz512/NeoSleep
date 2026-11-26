import { describe, it, expect } from "vitest";
import { sleepStudyDetailQuery, treatmentPlanDetailQuery } from "./clinicalListLinks";

describe("clinical list row → patient view (NEO-222)", () => {
  it("an Estudios row opens the Estudios tab with that study", () => {
    expect(sleepStudyDetailQuery({ id: "ss-1", patient_id: "p-1" })).toEqual({ tab: "studies", study: "ss-1" });
  });

  it("an Estudios row without an id still opens the Estudios tab", () => {
    expect(sleepStudyDetailQuery({ patient_id: "p-1" })).toEqual({ tab: "studies" });
  });

  it.each(["dental_appliance", "cpap", "positional", undefined])("a Tratamientos row (%s) opens the Dispositivo tab", (type) => {
    expect(treatmentPlanDetailQuery({ id: "tp-1", type })).toEqual({ tab: "orthoapnea" });
  });
});
