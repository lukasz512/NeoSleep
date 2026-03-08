import { describe, it, expect } from "vitest";
import router from "./router";

describe("Portal app", () => {
  it("router has login and dashboard routes", () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain("login");
    expect(names).toContain("dashboard");
  });

  it("default path redirects to dashboard", () => {
    const redirect = router.getRoutes().find((r) => r.path === "/");
    expect(redirect?.redirect).toBe("/dashboard");
  });

  it("portal has only portal view routes (no rep-only views)", () => {
    const names = router.getRoutes().map((r) => r.name).filter(Boolean) as string[];
    const repOnly = ["leads", "hcp", "hco", "planner", "presentations"];
    for (const name of repOnly) {
      expect(names).not.toContain(name);
    }
  });
});
