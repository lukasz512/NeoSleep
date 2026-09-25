import { describe, it, expect } from "vitest";
import { parseDateOfBirth } from "./patient.js";
import { ValidationError } from "../errors.js";

// Pure validation of the patient's date of birth (NEO-56) — the DB round trip
// is covered in routes/patient.spec.ts against a real Postgres.
describe("parseDateOfBirth", () => {
  const today = new Date(Date.UTC(2026, 8, 25));

  it("accepts a real past date and returns it unchanged", () => {
    expect(parseDateOfBirth("1968-03-12", today)).toBe("1968-03-12");
    expect(parseDateOfBirth("2000-02-29", today)).toBe("2000-02-29");
  });

  it("accepts today (newborn)", () => {
    expect(parseDateOfBirth("2026-09-25", today)).toBe("2026-09-25");
  });

  it("treats empty/null/undefined as no date", () => {
    expect(parseDateOfBirth("", today)).toBeNull();
    expect(parseDateOfBirth("  ", today)).toBeNull();
    expect(parseDateOfBirth(null, today)).toBeNull();
    expect(parseDateOfBirth(undefined, today)).toBeNull();
  });

  it.each([
    ["12.03.1968"],
    ["1968-3-12"],
    ["1968-03-12T00:00:00Z"],
    ["2001-02-29"],
    ["1990-13-01"],
    ["2026-09-26"],
    ["1899-12-31"],
  ])("rejects %s", (value) => {
    expect(() => parseDateOfBirth(value, today)).toThrow(ValidationError);
  });
});
