import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "./router/routes";

const router = createRouter({ history: createMemoryHistory(), routes });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

describe("Notification host mount point (NEO-10)", () => {
  it("App.vue mounts AppNotifications above the layout switch, so it covers both PublicLayout (/login) and AppLayout", () => {
    const appSource = readFileSync(path.resolve(__dirname, "App.vue"), "utf-8");
    expect(appSource).toContain('import AppNotifications from "./components/AppNotifications.vue"');
    expect(appSource).toMatch(/<AppNotifications\s*\/>\s*<component :is="layoutComponent" \/>/);
  });

  it("AppLayout no longer mounts its own AppNotifications instance (would double-render the toast host)", () => {
    const layoutSource = readFileSync(path.resolve(__dirname, "layouts/AppLayout.vue"), "utf-8");
    expect(layoutSource).not.toContain("AppNotifications");
  });

  it("main.ts provides neo:notify (bound to useNotifications().show) so packages/ui views can show a native toast without depending on apps/pwa directly", () => {
    const mainSource = readFileSync(path.resolve(__dirname, "main.ts"), "utf-8");
    expect(mainSource).toContain('import { useNotifications } from "./composables/useNotifications"');
    expect(mainSource).toContain('app.provide("neo:notify", useNotifications().show)');
  });
});
