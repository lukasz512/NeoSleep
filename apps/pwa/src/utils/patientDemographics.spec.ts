import { describe, it, expect } from "vitest";
import { ageFromDateOfBirth } from "./patientDemographics";

const today = new Date(2026, 8, 25); // 2026-09-25, local time

describe("ageFromDateOfBirth", () => {
  it("counts full years, not yet a year older before the birthday", () => {
    expect(ageFromDateOfBirth("1979-09-25", today)).toBe(47);
    expect(ageFromDateOfBirth("1979-09-26", today)).toBe(46);
    expect(ageFromDateOfBirth("1979-10-01", today)).toBe(46);
  });

  it("returns null for missing, malformed or future dates", () => {
    expect(ageFromDateOfBirth(null, today)).toBeNull();
    expect(ageFromDateOfBirth("25.09.1979", today)).toBeNull();
    expect(ageFromDateOfBirth("2030-01-01", today)).toBeNull();
  });
});
