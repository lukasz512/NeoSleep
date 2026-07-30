import { describe, it, expect } from "vitest";
import { hcpFormFields, hcpFormDerive, isCreatingNewOrganization } from "./hcpForm";

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

  it("organization_id (clinic) is a combobox (free text allowed) with an async loader", () => {
    const clinic = hcpFormFields.find((f) => f.key === "organization_id")!;
    expect(clinic.type).toBe("combobox");
    expect(typeof clinic.options).toBe("function");
    expect(typeof clinic.labelKey).toBe("function");
    expect(typeof clinic.color).toBe("function");
  });

  it("isCreatingNewOrganization: false when empty/unset, true for any typed value that matches nothing on the loaded clinic list", () => {
    // organizationsCache only fills in once loadOrganizationOptions()'s
    // network call resolves — until then (as here, a fresh module import)
    // it's empty, so any non-blank typed/pre-filled value reads as "new".
    // A real dialog re-renders once that load completes (see hcpForm.ts's
    // loadSpecialtyOptionsInheritedFirst/resolvedOptions() reactivity), so
    // this only shows as a brief flash, not a stuck wrong state.
    expect(isCreatingNewOrganization({})).toBe(false);
    expect(isCreatingNewOrganization({ organization_id: "" })).toBe(false);
    expect(isCreatingNewOrganization({ organization_id: "Some Clinic" })).toBe(true);
  });

  it("clinic label/color flip to the 'new clinic' variant only when isCreatingNewOrganization(form) is true", () => {
    const clinic = hcpFormFields.find((f) => f.key === "organization_id")!;
    const labelKey = clinic.labelKey as (form: Record<string, unknown>) => string;
    const color = clinic.color as (form: Record<string, unknown>) => string | undefined;

    expect(labelKey({})).toBe("user.hcp.form.clinic");
    expect(color({})).toBeUndefined();

    expect(labelKey({ organization_id: "Brand New Clinic" })).toBe("user.hcp.form.clinicNew");
    expect(color({ organization_id: "Brand New Clinic" })).toBe("success");
  });

  it("new_organization.* fields are hidden unless creating a new clinic, and share the new_organization payload bucket", () => {
    const newOrgFields = hcpFormFields.filter((f) => f.nestUnder === "new_organization");
    expect(newOrgFields.map((f) => f.key).sort()).toEqual(
      ["org_address_line1", "org_city", "org_phone", "org_postal_code", "org_region", "org_type"].sort(),
    );
    for (const f of newOrgFields) {
      expect(typeof f.hidden).toBe("function");
      const hidden = f.hidden as (form: Record<string, unknown>) => boolean;
      expect(hidden({})).toBe(true);
      expect(hidden({ organization_id: "Brand New Clinic" })).toBe(false);
    }
  });

  it("new_organization.* keys don't collide with the practitioner's own hidden region or identity phone", () => {
    // useFormRenderer's form state is a flat object keyed by bare `key`
    // regardless of `nestUnder` — a plain "region"/"phone" here would
    // silently overwrite those two fields' slots.
    const keys = hcpFormFields.map((f) => f.key);
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(duplicates).toEqual([]);
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

  it("hcpFormDerive follows new_organization.org_region while typing a brand new clinic (no id to look up yet)", () => {
    expect(hcpFormDerive({
      organization_id: "Brand New Clinic",
      new_organization: { org_region: "PL" },
    })).toEqual({ region: "PL" });

    expect(hcpFormDerive({
      organization_id: "Brand New Clinic",
      new_organization: {},
    })).toBeUndefined();
  });
});
