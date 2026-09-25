import { describe, it, expect } from "vitest";
import { patientFormFields } from "./patientForm";

describe("patientFormFields", () => {
  it("leads with the shared Identity block, prefix key renamed to 'salutation'", () => {
    expect(patientFormFields.slice(0, 5).map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone",
    ]);
    expect(patientFormFields[0].labelKey).toBe("app.identity.form.prefix");
  });

  it("practitioner_id is an autocomplete with an async loader", () => {
    const practitioner = patientFormFields.find((f) => f.key === "practitioner_id")!;
    expect(practitioner.type).toBe("autocomplete");
    expect(typeof practitioner.options).toBe("function");
  });

  it("status defaults to active; ahi_baseline is a number field", () => {
    const status = patientFormFields.find((f) => f.key === "status")!;
    const ahi = patientFormFields.find((f) => f.key === "ahi_baseline")!;
    expect(status.default).toBe("active");
    expect(ahi.type).toBe("number");
  });

  it("carries the full existing field set (no fields dropped in the migration)", () => {
    expect(patientFormFields.map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone", "date_of_birth",
      "practitioner_id", "status", "region", "territory_id", "country_code", "ahi_baseline", "cpap_device", "medical_record",
    ]);
  });

  // ADR-020's region-scoping fix (middleware/requireScope.ts) needs country_code
  // populated on every patient — hidden, defaulted from the creating user's own
  // country, same pattern as hcoForm.ts's country_code field.
  it("country_code is always hidden with a function default", () => {
    const countryCode = patientFormFields.find((f) => f.key === "country_code")!;
    expect(countryCode.hidden).toBe(true);
    expect(typeof countryCode.default).toBe("function");
  });

  it("territory_id is an autocomplete with an async loader", () => {
    const territory = patientFormFields.find((f) => f.key === "territory_id")!;
    expect(territory.type).toBe("autocomplete");
    expect(typeof territory.options).toBe("function");
  });
});
