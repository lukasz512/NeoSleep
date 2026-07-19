import { describe, it, expect } from "vitest";
import { leadFormFields } from "./leadForm";

function isHidden(field: { hidden?: boolean | (() => boolean) }): boolean {
  return typeof field.hidden === "function" ? field.hidden() : !!field.hidden;
}

describe("leadFormFields", () => {
  it("leads with the shared Identity block", () => {
    expect(leadFormFields.slice(0, 5).map((f) => f.key)).toEqual([
      "title", "first_name", "last_name", "email", "phone",
    ]);
  });

  it("institution is required and nested under metadata", () => {
    const institution = leadFormFields.find((f) => f.key === "institution")!;
    expect(institution.required).toBe(true);
    expect(institution.nestUnder).toBe("metadata");
  });

  it("status and region are hidden (silently defaulted, not shown as controls)", () => {
    const status = leadFormFields.find((f) => f.key === "status")!;
    const region = leadFormFields.find((f) => f.key === "region")!;
    expect(isHidden(status)).toBe(true);
    expect(isHidden(region)).toBe(true);
    expect(status.default).toBe("new");
    expect(typeof region.default).toBe("function");
  });

  it("exposes only Identity + institution + hidden status/region — nothing else", () => {
    expect(leadFormFields.map((f) => f.key)).toEqual([
      "title", "first_name", "last_name", "email", "phone", "institution", "status", "region",
    ]);
  });
});
