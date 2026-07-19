import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import en from "@i18n/en.json";
import { navRoutesForRole } from "../router/routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_MODULE_ROUTES = ["dashboard", "leads", "planner", "hcp", "hco", "patients", "presentations", "users"] as const;

/** Combined source of AppLayout.vue and all layout components (for markup/CSS assertions). */
function getLayoutSource(): string {
  const layoutPath = path.resolve(__dirname, "AppLayout.vue");
  const componentsDir = path.resolve(__dirname, "components");
  const sources: string[] = [readFileSync(layoutPath, "utf-8")];
  try {
    const entries = readdirSync(componentsDir);
    for (const name of entries) {
      if (name.endsWith(".vue")) {
        sources.push(readFileSync(path.join(componentsDir, name), "utf-8"));
      }
    }
  } catch {
    // no components dir
  }
  return sources.join("\n");
}

describe("AppLayout", () => {
  describe("accessibility (keyboard and screen readers)", () => {
    it("has skip link to main content for keyboard and screen reader users", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-skip-link");
      expect(source).toMatch(/href=["']#main-content["']/);
      expect(source).toContain("layout.skipToMain");
    });

    it("main content has id for skip target and screen readers", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/id=["']main-content["']/);
    });

    it("skip link is visually hidden until focused (position and transform)", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-skip-link\s*\{[\s\S]*?position:\s*absolute/);
      expect(source).toMatch(/\.layout-skip-link:focus\s*\{[\s\S]*?transform:\s*translateY\(0\)/);
    });

    it("skip link supports keyboard (Enter key) and scrolls/focuses main into view", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toMatch(/@keydown\.enter\.prevent/);
      const composableSource = readFileSync(path.resolve(__dirname, "../composables/useLayoutState.ts"), "utf-8");
      expect(composableSource).toContain("scrollIntoView");
      expect(composableSource).toMatch(/scrollIntoView\s*\(\s*\{\s*behavior:\s*["']smooth["']/);
      expect(composableSource).toContain("el.focus(");
    });
  });

  describe("shared AppShell (packages/ui) drives the responsive chrome", () => {
    it("AppLayout uses the shared AppShell component, not a hand-rolled drawer/appbar", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain('import { AppShell } from "@ui"');
      expect(appLayoutSource).toContain("<AppShell");
    });

    it("passes the role-filtered nav list into AppShell for the mobile bottom bar", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain(":nav-items=\"visibleNavItems\"");
      expect(appLayoutSource).toContain("useVisibleNavRoutes");
    });

    it("mobile drawer close is wired: AppNavLinks emits navigate, AppLayout closes the drawer", () => {
      const navLinksSource = readFileSync(path.resolve(__dirname, "components/AppNavLinks.vue"), "utf-8");
      expect(navLinksSource).toContain("$emit('navigate')");
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain('@navigate="mobileDrawerOpen = false"');
    });
  });

  describe("sidebar nav icons and role-based visibility", () => {
    it("nav icons are inline SVG with viewBox and currentColor so they inherit link color", () => {
      const appIconSource = readFileSync(path.resolve(__dirname, "../components/AppIcon.vue"), "utf-8");
      expect(appIconSource).toContain('viewBox="0 0 24 24"');
      expect(appIconSource).toContain('stroke="currentColor"');
      const navLinksSource = readFileSync(path.resolve(__dirname, "components/AppNavLinks.vue"), "utf-8");
      expect(navLinksSource).toContain("layout-app__nav-icon");
    });

    it("rep sees every core module (leads, hcp, hco, patients, planner, presentations) but not users; dashboard is never in the nav", () => {
      const expectedPaths = ["/leads", "/hcp", "/hco", "/patients", "/planner", "/presentations"];
      expect(navRoutesForRole("rep").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("manager sees users management but not leads (rep-only)", () => {
      const expectedPaths = ["/hcp", "/hco", "/patients", "/planner", "/presentations", "/users"];
      expect(navRoutesForRole("manager").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("admin always sees every nav item, including leads (rep-only for everyone else)", () => {
      const expectedPaths = ["/leads", "/hcp", "/hco", "/patients", "/planner", "/presentations", "/users"];
      expect(navRoutesForRole("admin").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("doctor sees only patients, planner, presentations", () => {
      const expectedPaths = ["/patients", "/planner", "/presentations"];
      expect(navRoutesForRole("doctor").map((r) => r.path)).toEqual(expectedPaths);
    });
  });

  describe("header module title", () => {
    it("i18n has title key for each app module route so header can show module name above the line", () => {
      const messages = en as Record<string, string>;
      for (const routeName of APP_MODULE_ROUTES) {
        const key = `user.${routeName}.title`;
        expect(messages[key], `missing i18n key: ${key}`).toBeDefined();
        expect(typeof messages[key]).toBe("string");
        expect(messages[key].length).toBeGreaterThan(0);
      }
    });

    it("header derives module title from the current route (useRoute), not a prop", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain("useRoute()");
      expect(appLayoutSource).toContain("navTitleKey(name)");
      expect(appLayoutSource).not.toContain(":route-name=");
    });
  });

  describe("admin-only controls", () => {
    it("theme panel feature (Theme & style editor) has been fully removed, not just hidden", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).not.toContain("ThemePanel");
      expect(appLayoutSource).not.toContain("themePanel");
      const componentsDir = path.resolve(__dirname, "components");
      expect(readdirSync(componentsDir)).not.toContain("ThemePanel.vue");
    });
  });

  describe("top bar: logo-only on the right, hamburger + title on the left", () => {
    it("app bar's right side renders only the logo — no role-preview select, no user menu", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).not.toContain("app-bar-actions");
      expect(appLayoutSource).not.toContain("rolePreview");
      expect(appLayoutSource).not.toContain("VSelect");
    });

    it("app bar logo slot renders only for the 'bar' location — the left drawer no longer shows a logo", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toMatch(/v-if=["']location === ['"]bar['"]["']/);

      const appLogoSource = readFileSync(path.resolve(__dirname, "components/AppLogo.vue"), "utf-8");
      // The sidebar/drawer logo variant has been removed entirely, not just hidden.
      expect(appLogoSource).not.toContain("variant");
      expect(appLogoSource).not.toContain("layout-app__logo-icon");
      expect(appLogoSource).toContain("layout-app__bar-logo-link");
      const barLinkClassBody = appLogoSource.match(/\.layout-app__bar-logo-link\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
      expect(barLinkClassBody).not.toContain("::after");
      expect(barLinkClassBody).not.toContain("border");
    });

    it("the shared AppShell always shows the app-bar logo (not mobile-only)", () => {
      const appShellSource = readFileSync(
        path.resolve(__dirname, "../../../../packages/ui/src/components/AppShell.vue"),
        "utf-8",
      );
      expect(appShellSource).not.toContain('v-if="mobile" class="app-shell__bar-logo"');
      expect(appShellSource).toContain("app-shell__bar-logo");
    });
  });

  describe("user menu and sidebar collapse toggle live in the desktop drawer footer", () => {
    it("desktop drawer-footer renders both the user menu and the collapse toggle", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain("layout-nav-footer");
      expect(appLayoutSource).toContain("AppUserMenuPanel");
      expect(appLayoutSource).toContain("toggleSidebar");
    });
  });

  describe("view transitions", () => {
    it("RouterView uses Transition with view-fade-lift for smooth view changes", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain("RouterView");
      expect(appLayoutSource).toContain("Transition");
      expect(appLayoutSource).toContain('name="view-fade-lift"');
      expect(appLayoutSource).toContain('mode="out-in"');
    });
  });
});
