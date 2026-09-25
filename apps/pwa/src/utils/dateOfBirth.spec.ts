import { describe, it, expect } from "vitest";
import { formatDateOfBirth, dateOfBirthRule } from "./dateOfBirth";

describe("formatDateOfBirth", () => {
  it("spells the month out so the date can't be read two ways", () => {
    expect(formatDateOfBirth("1968-03-12", "en")).toBe("Mar 12, 1968");
    expect(formatDateOfBirth("1968-03-12", "pl")).toBe("12 mar 1968");
    expect(formatDateOfBirth("1968-03-12", "mx")).toBe("12 mar 1968");
  });

  it("never shifts the day, whatever the runtime timezone (formats in UTC)", () => {
    expect(formatDateOfBirth("2000-01-01", "en")).toBe("Jan 1, 2000");
    expect(formatDateOfBirth("1999-12-31", "en")).toBe("Dec 31, 1999");
  });

  it("returns an empty string for missing or malformed values", () => {
    expect(formatDateOfBirth(null, "en")).toBe("");
    expect(formatDateOfBirth("", "en")).toBe("");
    expect(formatDateOfBirth("12.03.1968", "en")).toBe("");
    expect(formatDateOfBirth("1990-02-30", "en")).toBe("");
  });
});

describe("dateOfBirthRule", () => {
  const today = new Date(2026, 8, 25);

  it("accepts empty and valid past dates", () => {
    expect(dateOfBirthRule("", today)).toBe(true);
    expect(dateOfBirthRule(null, today)).toBe(true);
    expect(dateOfBirthRule("1968-03-12", today)).toBe(true);
    expect(dateOfBirthRule("2026-09-25", today)).toBe(true);
  });

  it.each(["2026-09-26", "1899-12-31", "1990-02-30", "garbage"])("rejects %s", (v) => {
    expect(dateOfBirthRule(v, today)).toBe("app.patients.form.validation.dateOfBirthInvalid");
  });
});
