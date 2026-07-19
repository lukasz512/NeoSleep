import { describe, it, expect } from "vitest";
import { hcoFormFields } from "./hcoForm";

function isHidden(field: { hidden?: boolean | (() => boolean) }): boolean {
  return typeof field.hidden === "function" ? field.hidden() : !!field.hidden;
}

describe("hcoFormFields", () => {
  it("does not use the Identity block (an organization has no person)", () => {
    expect(hcoFormFields.some((f) => f.key === "first_name")).toBe(false);
    expect(hcoFormFields[0].key).toBe("name");
    expect(hcoFormFields[0].required).toBe(true);
  });

  it("country_code is always hidden with a function default", () => {
    const countryCode = hcoFormFields.find((f) => f.key === "country_code")!;
    expect(isHidden(countryCode)).toBe(true);
    expect(typeof countryCode.default).toBe("function");
  });

  it("status is hidden via a function (admin-gated), not a static boolean", () => {
    const status = hcoFormFields.find((f) => f.key === "status")!;
    expect(typeof status.hidden).toBe("function");
    expect(status.default).toBe("active");
  });

  it("specialties is a multi-select autocomplete with an async loader (not 'chips', which never uses options)", () => {
    const specialties = hcoFormFields.find((f) => f.key === "specialties")!;
    expect(specialties.type).toBe("autocomplete");
    expect(specialties.multiple).toBe(true);
    expect(typeof specialties.options).toBe("function");
  });

  it("google_link, website, phone, email carry icons", () => {
    const byKey = Object.fromEntries(hcoFormFields.map((f) => [f.key, f]));
    expect(byKey.phone.icon).toBe("phone");
    // 'at' — the same email input as identityFields' emailField(), reused
    // here (not required) so there's exactly one email input style app-wide.
    expect(byKey.email.icon).toBe("at");
    expect(byKey.email.required).toBeFalsy();
    expect(byKey.website.icon).toBe("globe");
    expect(byKey.google_link.icon).toBe("map-pin");
  });

  it("google_link is not required", () => {
    const googleLink = hcoFormFields.find((f) => f.key === "google_link")!;
    expect(googleLink.required).toBeFalsy();
  });

  it("cols:6 fields are (type,region), (postal_code,city), state — country_code/status never carry cols:6", () => {
    // Deliberately does not call the admin-gated `status.hidden()` function
    // (would require an active Pinia instance) — `cols` alone already proves
    // status/country_code can't land in a cols:6 pairing regardless of hidden state.
    const sixCol = hcoFormFields.filter((f) => f.cols === 6).map((f) => f.key);
    expect(sixCol).toEqual(["type", "region", "postal_code", "city", "state"]);
  });
});
