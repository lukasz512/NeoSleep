import { describe, it, expect } from "vitest";
import router from "./router";

describe("Admin app", () => {
  it("router has login and dashboard routes", () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain("login");
    expect(names).toContain("dashboard");
  });

  it("default path redirects to dashboard", () => {
    const redirect = router.getRoutes().find((r) => r.path === "/");
    expect(redirect?.redirect).toBe("/dashboard");
  });
});
