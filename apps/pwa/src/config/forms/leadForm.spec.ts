import { describe, it, expect } from "vitest";
import { leadFormFields } from "./leadForm";

function isHidden(field: { hidden?: boolean | ((form: Record<string, unknown>) => boolean) }, form: Record<string, unknown> = {}): boolean {
  return typeof field.hidden === "function" ? field.hidden(form) : !!field.hidden;
}

function isRequired(field: { required?: boolean | ((form: Record<string, unknown>) => boolean) }, form: Record<string, unknown> = {}): boolean {
  return typeof field.required === "function" ? field.required(form) : !!field.required;
}

describe("leadFormFields", () => {
  it("leads with the shared Identity block", () => {
    expect(leadFormFields.slice(0, 5).map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone",
    ]);
  });

  it("institution is required only for a doctor lead, hidden for a patient lead", () => {
    const institution = leadFormFields.find((f) => f.key === "institution")!;
    expect(institution.nestUnder).toBe("metadata");
    expect(isRequired(institution, { type: "doctor" })).toBe(true);
    expect(isRequired(institution, { type: "hospital" })).toBe(false);
    expect(isRequired(institution, { type: "patient" })).toBe(false);
    expect(isHidden(institution, { type: "patient" })).toBe(true);
    expect(isHidden(institution, { type: "doctor" })).toBe(false);
  });

  it("diagnosis is only visible for a patient lead, never required, and nested under metadata", () => {
    const diagnosis = leadFormFields.find((f) => f.key === "diagnosis")!;
    expect(diagnosis.nestUnder).toBe("metadata");
    expect(isHidden(diagnosis, { type: "patient" })).toBe(false);
    expect(isHidden(diagnosis, { type: "doctor" })).toBe(true);
    expect(isHidden(diagnosis, { type: "hospital" })).toBe(true);
    expect(isHidden(diagnosis, { type: "other" })).toBe(true);
    expect(isRequired(diagnosis)).toBe(false);
    expect(typeof diagnosis.default).toBe("function");
  });

  it("status and region are hidden (silently defaulted, not shown as controls)", () => {
    const status = leadFormFields.find((f) => f.key === "status")!;
    const region = leadFormFields.find((f) => f.key === "region")!;
    expect(isHidden(status)).toBe(true);
    expect(isHidden(region)).toBe(true);
    expect(status.default).toBe("new");
    expect(typeof region.default).toBe("function");
  });

  it("exposes only Identity + institution + diagnosis + hidden status/region/type — nothing else", () => {
    expect(leadFormFields.map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone",
      "institution", "diagnosis", "type", "status", "region",
    ]);
  });
});
