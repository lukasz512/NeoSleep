import { describe, it, expect } from "vitest";
import { getAllowedCountryCodes, assertScopeAccess } from "./requireScope.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { UserRoleScope } from "../db.js";
import { ForbiddenError } from "../errors.js";

function makeCtx(roles: UserRoleScope[]): TenantContext {
  return {
    slug: "test",
    client: {} as TenantContext["client"],
    user: { id: "u1", email: "qa@example.com", role: "admin", roles },
    requestId: "test-request-id",
  };
}

describe("getAllowedCountryCodes", () => {
  it("returns null (unrestricted) when any role has scope 'global'", () => {
    expect(getAllowedCountryCodes([{ role: "admin", scope: "global" }])).toBeNull();
  });

  it("returns null when 'global' is mixed with country-scoped roles", () => {
    expect(
      getAllowedCountryCodes([
        { role: "rep", scope: "PL" },
        { role: "admin", scope: "global" },
      ])
    ).toBeNull();
  });

  it("returns the union of country_codes across all roles when none is global", () => {
    expect(
      getAllowedCountryCodes([
        { role: "rep", scope: "PL" },
        { role: "kam", scope: "MX" },
      ])
    ).toEqual(["PL", "MX"]);
  });

  it("de-duplicates repeated scopes across roles", () => {
    expect(
      getAllowedCountryCodes([
        { role: "rep", scope: "PL" },
        { role: "kam", scope: "PL" },
      ])
    ).toEqual(["PL"]);
  });

  it("returns [] (matches nothing) for an empty roles array — fails secure, not open", () => {
    expect(getAllowedCountryCodes([])).toEqual([]);
  });

  it("returns [] for undefined roles (stale pre-migration session) — fails secure, not open", () => {
    expect(getAllowedCountryCodes(undefined)).toEqual([]);
  });
});

describe("assertScopeAccess", () => {
  it("allows any record when the actor has a global-scoped role", () => {
    const ctx = makeCtx([{ role: "admin", scope: "global" }]);
    expect(() => assertScopeAccess(ctx, "MX")).not.toThrow();
    expect(() => assertScopeAccess(ctx, null)).not.toThrow();
  });

  it("allows a record whose country_code matches an allowed scope", () => {
    const ctx = makeCtx([{ role: "rep", scope: "PL" }]);
    expect(() => assertScopeAccess(ctx, "PL")).not.toThrow();
  });

  it("throws ForbiddenError for a record outside every allowed scope", () => {
    const ctx = makeCtx([{ role: "rep", scope: "PL" }]);
    expect(() => assertScopeAccess(ctx, "MX")).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when the record has no country_code and the actor isn't global", () => {
    const ctx = makeCtx([{ role: "rep", scope: "PL" }]);
    expect(() => assertScopeAccess(ctx, null)).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError for every record when the actor has no roles (fail secure)", () => {
    const ctx = makeCtx([]);
    expect(() => assertScopeAccess(ctx, "PL")).toThrow(ForbiddenError);
  });
});
