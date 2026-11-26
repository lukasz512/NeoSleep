import { describe, it, expect } from "vitest";
import { userRoleBadge, primaryUserRole } from "./userRoleBadge";

describe("userRoleBadge", () => {
  it("maps each role to its decided icon and disc tone", () => {
    expect(userRoleBadge("admin")).toEqual({ role: "admin", icon: "star", tone: "primary" });
    expect(userRoleBadge("manager")).toEqual({ role: "manager", icon: "shield-check", tone: "dark" });
    expect(userRoleBadge("kam")).toEqual({ role: "kam", icon: "hco-hospital", tone: "dark" });
    expect(userRoleBadge("msl")).toEqual({ role: "msl", icon: "nav-presentations", tone: "dark" });
    expect(userRoleBadge("rep")).toEqual({ role: "rep", icon: "map-pin", tone: "light" });
  });

  it("doctor gets their specialty icon, stethoscope when unknown", () => {
    expect(userRoleBadge("doctor", { specialty: "dentist" })?.icon).toBe("specialty-dentist");
    expect(userRoleBadge("doctor")?.icon).toBe("nav-hcp");
    expect(userRoleBadge("doctor")?.tone).toBe("dark");
  });

  it("picks highest-priority role", () => {
    expect(primaryUserRole(["rep", "manager", "admin"])).toBe("admin");
    expect(primaryUserRole(["rep", "doctor"])).toBe("doctor");
    expect(userRoleBadge(["msl", "kam"])?.role).toBe("kam");
  });

  it("unknown role returns null", () => {
    expect(userRoleBadge("superhero")).toBeNull();
    expect(userRoleBadge(null)).toBeNull();
    expect(userRoleBadge([])).toBeNull();
  });

  it("tenant override from app_config swaps the icon, keeps the tone", () => {
    expect(userRoleBadge("manager", { overrides: { manager: "users-group" } })).toEqual({
      role: "manager",
      icon: "users-group",
      tone: "dark",
    });
  });

  it("ignores an override that is not an allowed badge icon", () => {
    expect(userRoleBadge("rep", { overrides: { rep: "no-such-icon" } })?.icon).toBe("map-pin");
    expect(userRoleBadge("rep", { overrides: { rep: 42 } })?.icon).toBe("map-pin");
  });
});
