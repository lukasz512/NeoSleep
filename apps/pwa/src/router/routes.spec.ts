import { describe, it, expect } from "vitest";
import { isRoleAllowed, navRoutesForRole } from "./routes";

describe("isRoleAllowed", () => {
  it("allows any role when a route has no roles restriction", () => {
    expect(isRoleAllowed(undefined, "rep")).toBe(true);
    expect(isRoleAllowed(undefined, null)).toBe(true);
  });

  it("denies when the role isn't in the allowed list", () => {
    expect(isRoleAllowed(["admin", "manager"], "rep")).toBe(false);
  });

  it("denies when there is no role at all", () => {
    expect(isRoleAllowed(["admin"], undefined)).toBe(false);
    expect(isRoleAllowed(["admin"], null)).toBe(false);
  });

  it("allows when the role is in the allowed list", () => {
    expect(isRoleAllowed(["admin", "manager"], "manager")).toBe(true);
  });

  it("admin always bypasses the roles list, even when not explicitly listed", () => {
    expect(isRoleAllowed(["rep"], "admin")).toBe(true);
  });
});

describe("navRoutesForRole", () => {
  it("rep does not see /users", () => {
    expect(navRoutesForRole("rep").some((r) => r.path === "/users")).toBe(false);
  });

  it("admin sees everything, including /users and /leads (always bypasses role restrictions)", () => {
    const paths = navRoutesForRole("admin").map((r) => r.path);
    expect(paths).toContain("/users");
    expect(paths).toContain("/leads");
  });

  it("unauthenticated (no role) sees nothing restricted", () => {
    expect(navRoutesForRole(null)).toEqual([]);
  });
});
