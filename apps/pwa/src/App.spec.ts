import { describe, it, expect } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "./router/routes";

const router = createRouter({ history: createMemoryHistory(), routes });

describe("Pwa app", () => {
  it("router has login and dashboard routes", () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain("login");
    expect(names).toContain("dashboard");
  });

  it("router has app-layout routes (dashboard, leads, hcp, hco, planner, presentations) with app layout meta", () => {
    const allRoutes = router.getRoutes();
    const appRoutes = ["dashboard", "leads", "planner", "hcp", "hco", "presentations"];
    for (const name of appRoutes) {
      const r = allRoutes.find((x) => x.name === name);
      expect(r).toBeDefined();
      expect(r?.meta?.layout).toBe("app");
    }
  });

  it("root path redirects to login so app starts at login", () => {
    const redirect = router.getRoutes().find((r) => r.path === "/");
    expect(redirect?.redirect).toBe("/login");
  });

  it("pwa app has only rep view routes (no portal-only views)", () => {
    const names = router.getRoutes().map((r) => r.name).filter(Boolean) as string[];
    const portalOnly = ["documents", "agreements", "profile"];
    for (const name of portalOnly) {
      expect(names).not.toContain(name);
    }
  });
});
