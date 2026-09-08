import { describe, it, expect } from "vitest";
import { patientStatusColor, patientStatusLabel } from "./patientStatus";

// Identity-ish stub: returns the key itself so assertions can check exactly
// which i18n key each status resolves to, without needing vue-i18n set up.
const t = (key: string) => key;

describe("patientStatusColor", () => {
  it("maps each known status to its color", () => {
    expect(patientStatusColor("active")).toBe("success");
    expect(patientStatusColor("follow_up")).toBe("warning");
    expect(patientStatusColor("discharged")).toBe("default");
  });

  it("falls back to 'default' for an unknown/missing status", () => {
    expect(patientStatusColor("something_new")).toBe("default");
    expect(patientStatusColor(undefined)).toBe("default");
  });
});

describe("patientStatusLabel", () => {
  it("resolves each known status to its i18n key", () => {
    expect(patientStatusLabel(t, "active")).toBe("app.patients.filters.statusActive");
    expect(patientStatusLabel(t, "follow_up")).toBe("app.patients.filters.statusFollowUp");
    expect(patientStatusLabel(t, "discharged")).toBe("app.patients.filters.statusDischarged");
  });

  it("falls back to the raw status string for an unknown value, empty string when missing", () => {
    expect(patientStatusLabel(t, "something_new")).toBe("something_new");
    expect(patientStatusLabel(t, undefined)).toBe("");
  });
});
