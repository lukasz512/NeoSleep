import { describe, it, expect } from "vitest";
import { hcpFormFields, hcpFormDerive } from "./hcpForm";

describe("hcpFormFields", () => {
  it("leads with the shared Identity block, prefix key renamed to 'salutation'", () => {
    expect(hcpFormFields.slice(0, 5).map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone",
    ]);
    // The renamed field keeps the shared Identity label/type/row layout —
    // only the payload key changes to match apps/api/src/db/practitioner.ts's
    // JS-facing field name.
    expect(hcpFormFields[0].labelKey).toBe("app.identity.form.prefix");
    expect(hcpFormFields[0].type).toBe("combobox");
  });

  it("organization_id (clinic) is an autocomplete with an async loader", () => {
    const clinic = hcpFormFields.find((f) => f.key === "organization_id")!;
    expect(clinic.type).toBe("autocomplete");
    expect(typeof clinic.options).toBe("function");
  });

  it("primary_specialty depends on organization_id and auto-selects the first inherited option", () => {
    const specialty = hcpFormFields.find((f) => f.key === "primary_specialty")!;
    expect(specialty.dependsOn).toEqual(["organization_id"]);
    expect(specialty.autoSelectFirstIfEmpty).toBe(true);
  });

  it("influence_tier defaults to A (not the DB's own default of C)", () => {
    const tier = hcpFormFields.find((f) => f.key === "influence_tier")!;
    expect(tier.default).toBe("A");
  });

  it("region is always hidden — populated live via hcpFormDerive, not a static default", () => {
    const region = hcpFormFields.find((f) => f.key === "region")!;
    expect(region.hidden).toBe(true);
    expect(region.default).toBeUndefined();
  });

  it("language is hidden with a function default (inherited from the creating user)", () => {
    const language = hcpFormFields.find((f) => f.key === "language")!;
    expect(language.hidden).toBe(true);
    expect(typeof language.default).toBe("function");
  });

  it("national id keeps the literal key 'primary' nested under national_ids (matches existing saved data)", () => {
    const nationalId = hcpFormFields.find((f) => f.nestUnder === "national_ids")!;
    expect(nationalId.key).toBe("primary");
    expect(nationalId.icon).toBe("id-card");
  });

  it("social links (linkedin/instagram/facebook/google) all nest under social_links with icons", () => {
    const social = hcpFormFields.filter((f) => f.nestUnder === "social_links");
    expect(social.map((f) => f.key).sort()).toEqual(["facebook", "google", "instagram", "linkedin"]);
    for (const f of social) expect(f.icon).toBeTruthy();
  });

  it("hcpFormDerive returns nothing when no clinic is selected yet", () => {
    expect(hcpFormDerive({})).toBeUndefined();
    expect(hcpFormDerive({ organization_id: "" })).toBeUndefined();
  });
});
