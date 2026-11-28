import { describe, it, expect } from "vitest";
import { canUseAi } from "./canUseAi";

describe("canUseAi (CORE-292)", () => {
  it("is on for admin only, mirroring the /ai route roles", () => {
    expect(canUseAi("admin")).toBe(true);
    for (const role of ["manager", "kam", "msl", "rep", "doctor", "support"] as const) {
      expect(canUseAi(role)).toBe(false);
    }
  });
  it("is off without a role", () => {
    expect(canUseAi(undefined)).toBe(false);
    expect(canUseAi(null)).toBe(false);
  });
});
