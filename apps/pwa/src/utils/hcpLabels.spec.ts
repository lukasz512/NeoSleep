import { describe, it, expect } from "vitest";
import { practitionerSpecialtyIcon } from "./hcpLabels";

describe("practitionerSpecialtyIcon", () => {
  it("gives dentist its own tooth icon, distinct from the other specialties", () => {
    expect(practitionerSpecialtyIcon("dentist")).toBe("specialty-dentist");
  });

  it("maps each other seeded specialty to its own distinct icon", () => {
    expect(practitionerSpecialtyIcon("ent")).toBe("specialty-ent");
    expect(practitionerSpecialtyIcon("gp")).toBe("specialty-gp");
    expect(practitionerSpecialtyIcon("neurologist")).toBe("specialty-neurologist");
    expect(practitionerSpecialtyIcon("psychiatrist")).toBe("specialty-psychiatrist");
    expect(practitionerSpecialtyIcon("cardiologist")).toBe("specialty-cardiologist");
    expect(practitionerSpecialtyIcon("pulmonologist")).toBe("specialty-pulmonologist");
  });

  it("falls back to the generic HCP icon for an unseeded/tenant-added specialty or missing code", () => {
    expect(practitionerSpecialtyIcon("something_new")).toBe("nav-hcp");
    expect(practitionerSpecialtyIcon(undefined)).toBe("nav-hcp");
  });
});
