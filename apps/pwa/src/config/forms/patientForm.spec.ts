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
      "salutation", "first_name", "last_name", "email", "phone",
      "practitioner_id", "status", "region", "ahi_baseline", "cpap_device", "medical_record",
    ]);
  });
});
