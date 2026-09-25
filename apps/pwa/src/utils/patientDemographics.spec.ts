import { describe, it, expect } from "vitest";
import { ageFromDateOfBirth, patientSexAge } from "./patientDemographics";

const t = (key: string, params?: Record<string, unknown>) =>
  ({
    "app.patients.sexShort.female": "F",
    "app.patients.sexShort.male": "M",
    "app.patients.ageShort": `${String(params?.age)} y`,
  })[key] ?? key;

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

describe("patientSexAge", () => {
  it("joins the sex letter and age", () => {
    expect(patientSexAge({ gender: "female", date_of_birth: "1979-01-10" }, t, today)).toBe("F · 47 y");
    expect(patientSexAge({ gender: "male", date_of_birth: null }, t, today)).toBe("M");
  });

  it("never shows a letter for other / prefer_not_to_say", () => {
    expect(patientSexAge({ gender: "other", date_of_birth: "1979-01-10" }, t, today)).toBe("47 y");
    expect(patientSexAge({ gender: "prefer_not_to_say", date_of_birth: null }, t, today)).toBe("");
  });
});
