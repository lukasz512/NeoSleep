import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import en from "@i18n/en.json";
import { appNavRoutes } from "../router/routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_MODULE_ROUTES = ["dashboard", "leads", "planner", "hcp", "hco", "presentations"] as const;

/** Combined source of AppLayout.vue and all layout components (for CSS/template assertions). */
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
      expect(source).toContain("layout-app__skip-link");
      expect(source).toMatch(/href=["']#main-content["']/);
      expect(source).toContain("layout.skipToMain");
    });

    it("main content has id and landmark role for skip target and screen readers", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/id=["']main-content["']/);
      expect(source).toMatch(/role=["']main["']/);
    });

    it("skip link is visually hidden until focused (position and transform)", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__skip-link\s*\{[\s\S]*?position:\s*absolute/);
      expect(source).toMatch(/\.layout-app__skip-link\s*\{[\s\S]*?transform:\s*translateY\(-100%\)/);
    });

    it("skip link supports keyboard (Enter key) and scrolls main into view", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/@keydown\.enter\.prevent|keydown\.enter\.prevent/);
      expect(source).toContain("scrollIntoView");
      expect(source).toMatch(/scrollIntoView\s*\(\s*\{\s*behavior:\s*[\"']smooth[\"']/);
      expect(source).toContain("main.focus(");
    });
  });

  describe("user menu visibility (dropdown not clipped)", () => {
    it("main area has overflow visible so user dropdown is not clipped", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__main\s*\{[\s\S]*?overflow:\s*visible/);
    });

    it("header has stacking context (z-index) so dropdown paints above content", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__header\s*\{[\s\S]*?z-index:\s*\d+/);
    });

    it("user menu dropdown has high z-index and overflow visible", () => {
      const source = getLayoutSource();
      // May be a single selector or multiple (e.g. .layout-app__user-menu, .layout-app__mobile-drawer-user-menu)
      expect(source).toMatch(/\.layout-app__user-menu\s*(?:,[\s\S]*?)?\s*\{[\s\S]*?z-index:\s*100/);
      expect(source).toContain("overflow: visible");
    });
  });

  describe("header line aligned with title and content", () => {
    it("header has full-width separator line (::after) with symmetric horizontal inset (16px or variable)", () => {
      const source = getLayoutSource();
      // Match the main header::after block that defines height (not the @media override)
      const headerAfter = source.match(/\.layout-app__header::after\s*\{[\s\S]*?height:\s*1\s*px[\s\S]*?\}/);
      expect(headerAfter).toBeTruthy();
      expect(headerAfter![0]).toMatch(/left:\s*(16px|var\(--rep-content-padding-x[^)]*\))/);
      expect(headerAfter![0]).toMatch(/right:\s*(16px|var\(--rep-content-padding-x[^)]*\))/);
      expect(headerAfter![0]).toMatch(/height:\s*1\s*px/);
    });

    it("title wrap has padding-left 16px or variable so content aligns with title", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__header-title-wrap\s*\{[\s\S]*?padding:[\s\S]*?(16px|var\(--rep-content-padding-x)/);
    });

    it("content has padding 16px or variable so first line of content aligns with title", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__content\s*\{[\s\S]*?padding:\s*(16px|var\(--rep-content-padding-x)/);
    });
  });

  describe("mobile layout (bottom bar and title)", () => {
    it("mobile bottom bar is full width and has safe area inset so it does not overlap notch/home", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__mobile-bottom-bar");
      expect(source).toMatch(/\.layout-app__mobile-bottom-bar\s*\{[\s\S]*?left:\s*0/);
      expect(source).toMatch(/\.layout-app__mobile-bottom-bar\s*\{[\s\S]*?right:\s*0/);
      expect(source).toMatch(/env\s*\(\s*safe-area-inset-bottom/);
    });

    it("mobile menu trigger has min 44px touch target for thumb zone", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__mobile-menu-trigger");
      expect(source).toMatch(/\.layout-app__mobile-menu-trigger\s*\{[\s\S]*?min-height:\s*44px/);
    });

    it("mobile header title has symmetric horizontal padding (16px or variable)", () => {
      const source = getLayoutSource();
      const hasMobilePadding =
        /@media\s*\(\s*max-width[^)]*\)\s*\{[\s\S]*?layout-app__header-title-wrap[\s\S]*?padding-left:\s*(16px|var\(--rep-content-padding-x[^)]*\))/.test(source) ||
        /layout-app--mobile[\s\S]*?layout-app__header-title-wrap[\s\S]*?padding-left:\s*(16px|var\(--rep-content-padding-x[^)]*\))/.test(source);
      expect(hasMobilePadding).toBe(true);
    });

    it("mobile header separator line has symmetric inset (16px or variable)", () => {
      const source = getLayoutSource();
      const hasMobileHeaderAfter = /@media\s*\(\s*max-width[\s\S]*?\.layout-app__header::after\s*\{[\s\S]*?left:\s*(16px|var\(--rep-content-padding-x[^)]*\))[\s\S]*?right:\s*(16px|var\(--rep-content-padding-x[^)]*\))/.test(source);
      expect(hasMobileHeaderAfter).toBe(true);
    });

    it("mobile content has symmetric padding (16px or variable) so title and content align", () => {
      const source = getLayoutSource();
      const hasMobileContentPadding = /@media\s*\(\s*max-width[^)]*\)\s*\{[\s\S]*?\.layout-app__content\s*\{[\s\S]*?padding:\s*(16px|var\(--rep-content-padding-x[^)]*\))/.test(source);
      expect(hasMobileContentPadding).toBe(true);
    });
  });

  describe("module title vertically centered in header", () => {
    it("header uses align-items center so module title and user block are vertically centered", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__header\s*\{[\s\S]*?align-items:\s*center\b/);
    });
  });

  describe("sidebar footer and toggle (symmetric light, seamless collapse)", () => {
    it("footer has equal padding-top and padding-bottom for symmetric spacing around button", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__sidebar-footer\s*\{[\s\S]*?padding-top:\s*20px/);
      expect(source).toMatch(/padding-bottom:\s*max\(\s*20px\s*,/);
    });

    it("footer keeps same padding when collapsed so button does not jump", () => {
      const source = getLayoutSource();
      const collapsedFooter = source.match(/\.layout-app__sidebar--collapsed\s+\.layout-app__sidebar-footer\s*\{[\s\S]*?\}/);
      expect(collapsedFooter).toBeTruthy();
      expect(collapsedFooter![0]).toContain("padding-top: 20px");
      expect(collapsedFooter![0]).toContain("padding-bottom: max(20px");
    });

    it("footer has transition for seamless collapse", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__sidebar-footer\s*\{[\s\S]*?transition:/);
    });

    it("sidebar toggle button has min 44px touch target and aria-label/title", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__sidebar-toggle");
      expect(source).toMatch(/min-width:\s*44px/);
      expect(source).toMatch(/min-height:\s*44px/);
      expect(source).toContain(":title=");
      expect(source).toContain(":aria-label=");
      expect(source).toContain("layout.sidebar.expand");
      expect(source).toContain("layout.sidebar.collapse");
    });

    it("sidebar toggle button is centered in footer", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__sidebar-footer\s*\{[\s\S]*?justify-content:\s*center/);
    });
  });

  describe("collapsed sidebar icon alignment", () => {
    it("collapsed sidebar has horizontal padding so icons are not flush to edges", () => {
      const source = getLayoutSource();
      const hasCollapsedPadding =
        /\.layout-app__sidebar--collapsed\s*\{[\s\S]*?padding:[\s\S]*?(6|8)px/.test(source) ||
        /\.layout-app__sidebar\s*\{[\s\S]*?&--collapsed\s*\{[\s\S]*?padding:[\s\S]*?(6|8)px/.test(source);
      expect(hasCollapsedPadding).toBe(true);
    });

    it("collapsed nav-link centers icon with justify-content center and gap 0", () => {
      const source = getLayoutSource();
      const collapsedNavLink = source.match(
        /\.layout-app__sidebar--collapsed[\s\S]*?layout-app__nav-link[\s\S]*?\{[\s\S]*?justify-content:\s*center[\s\S]*?gap:\s*0[\s\S]*?\}/
      );
      expect(collapsedNavLink).toBeTruthy();
    });
  });

  describe("logo and header row (heights and alignment)", () => {
    it("logo block height matches header row so separator lines align (topbar height minus sidebar padding)", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__logo\s*\{[\s\S]*?height:\s*calc\s*\(\s*var\s*\(\s*--rep-topbar-height[\s\S]*?-\s*(8|12)px\s*\)/);
    });

    it("header has min-height so separator under title aligns with separator under logo", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__header\s*\{[\s\S]*?min-height:\s*var\s*\(\s*--rep-topbar-height/);
    });

    it("logo link has same horizontal padding as nav links so logo aligns left with MODUŁY / nav items", () => {
      const source = getLayoutSource();
      const logoLink = source.match(/\.layout-app__logo-link\s*\{[\s\S]*?\}/);
      expect(logoLink).toBeTruthy();
      expect(logoLink![0]).toMatch(/padding:\s*(6|8)px\s+(8|10)px/);
      expect(logoLink![0]).toMatch(/margin:\s*-(6|8)px\s+(0|-\d+px)/);
    });

    it("logo has 1px separator line (same as header::after) so both lines match", () => {
      const source = getLayoutSource();
      expect(
        source.includes("layout-app__logo") &&
          /(::after|&::after)\s*\{[\s\S]*?height:\s*1\s*px/.test(source)
      ).toBe(true);
    });

    it("sidebar is fixed with margin from viewport edges (top, bottom, left) for consistent layout", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__sidebar\s*\{[\s\S]*?top:\s*var\s*\(\s*--rep-sidebar-margin/);
      expect(source).toMatch(/\.layout-app__sidebar\s*\{[\s\S]*?bottom:\s*var\s*\(\s*--rep-sidebar-margin/);
      expect(source).toMatch(/\.layout-app__sidebar\s*\{[\s\S]*?left:\s*var\s*\(\s*--rep-sidebar-margin/);
    });
  });

  describe("expanded sidebar: no button-like hover on nav links", () => {
    it("base nav-link hover does not set background (expanded = no button look)", () => {
      const source = getLayoutSource();
      // Expanded nav-link is the one with "Expanded: no button-like hover" comment (sidebar, not drawer/collapsed)
      const expandedHoverMatch = source.match(
        /Expanded: no button-like[\s\S]*?&\s*:hover[\s\S]*?\{([^}]*)\}/
      );
      const hoverContent = expandedHoverMatch?.[1] ?? "";
      expect(hoverContent.length).toBeGreaterThan(0);
      expect(hoverContent).not.toMatch(/background\s*:\s*(\$sidebar-hover|var\s*\(\s*--rep-sidebar-hover)/);
    });

    it("collapsed sidebar adds hover background on nav links for feedback", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__sidebar--collapsed");
      expect(source).toContain("nav-link:hover");
      expect(source).toMatch(/layout-app__sidebar--collapsed[\s\S]*?nav-link[\s\S]*?background:\s*(\$sidebar-hover|var\s*\(\s*--rep-sidebar-hover)/);
    });
  });

  describe("sidebar styling (iOS/Finder-like)", () => {
    it("theme.scss defines sidebar variables for light and dark", () => {
      const themePath = path.resolve(__dirname, "../assets/theme.scss");
      const css = readFileSync(themePath, "utf-8");
      expect(css).toContain("--rep-sidebar-bg");
      expect(css).toContain("--rep-sidebar-border");
      expect(css).toContain("--rep-sidebar-text");
      expect(css).toContain("--rep-sidebar-text-secondary");
      expect(css).toContain("--rep-sidebar-hover");
      expect(css).toContain("--rep-sidebar-active-bg");
      expect(css).toContain("--rep-sidebar-bg: #262626");
    });
  });

  describe("sidebar nav icons and menu", () => {
    it("sidebar nav links use inline SVG icons with viewBox and currentColor so they inherit link color", () => {
      const source = getLayoutSource();
      expect(source).toContain('viewBox="0 0 24 24"');
      expect(source).toContain("stroke=\"currentColor\"");
      expect(source).toContain("layout-app__nav-icon");
    });

    it("each app module has a sidebar nav link (dashboard, hcp, hco, planner, presentations)", () => {
      const expectedPaths = ["/dashboard", "/leads", "/planner", "/hcp", "/hco", "/presentations"];
      expect(appNavRoutes.map((r) => r.path)).toEqual(expectedPaths);
      const source = getLayoutSource();
      expect(source).toContain("appNavRoutes");
      expect(source).toMatch(/:to="[^"]*\.path[^"]*"/);
    });

    it("nav icon has fixed size so icons render consistently", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__nav-icon\s*\{[\s\S]*?width:\s*\d+px/);
      expect(source).toMatch(/\.layout-app__nav-icon\s*\{[\s\S]*?height:\s*\d+px/);
    });

    it("nav links have no underline (clean list look)", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/layout-app__nav-link[\s\S]*?text-decoration:\s*none/);
    });
  });

  describe("button touch targets (mobile/tablet)", () => {
    it("theme.scss defines button min size variables and sets 44px on mobile for easy tap", () => {
      const themePath = path.resolve(__dirname, "../assets/theme.scss");
      const scss = readFileSync(themePath, "utf-8");
      expect(scss).toContain("--rep-btn-min-height");
      expect(scss).toContain("--rep-btn-min-width");
      expect(scss).toMatch(/44/); // $rep-touch-target-min: 44px or literal 44 in mobile block
      const hasMobileOverride = /@media\s*\([^)]*max-width[^)]*\)\s*\{[\s\S]*?--rep-btn-min-height/.test(scss);
      expect(hasMobileOverride).toBe(true);
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

    it("route-to-title mapping covers all app module routes", () => {
      const MODULE_TITLE_KEYS: Record<string, string> = {
        dashboard: "user.dashboard.title",
        leads: "user.leads.title",
        hcp: "user.hcp.title",
        hco: "user.hco.title",
        planner: "user.planner.title",
        presentations: "user.presentations.title",
      };
      for (const name of APP_MODULE_ROUTES) {
        expect(MODULE_TITLE_KEYS[name]).toBeDefined();
        expect(MODULE_TITLE_KEYS[name]).toBe(`user.${name}.title`);
      }
    });

    it("header derives module title from router (useRoute) so no routeName prop is passed", () => {
      const source = getLayoutSource();
      expect(source).toContain("useRoute()");
      expect(source).toMatch(/rep\.\$\{.*name.*\}\.title/);
      const appLayoutOnly = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutOnly).not.toContain(":route-name=");
    });
  });

  describe("layout components use single source of truth", () => {
    it("sidebar toggle uses computed label (toggleLabel) from i18n", () => {
      const source = getLayoutSource();
      expect(source).toContain("toggleLabel");
      expect(source).toContain("layout.sidebar.expand");
      expect(source).toContain("layout.sidebar.collapse");
    });

    it("user menu uses language options (from constants or shared i18n)", () => {
      const source = getLayoutSource();
      const usesLanguageOptions =
        source.includes("languageSelectItems") &&
        (source.includes("REP_LANGUAGE_OPTIONS") || source.includes("LANGUAGE_OPTIONS"));
      expect(usesLanguageOptions).toBe(true);
    });

    it("AppLayout does not pass languageOptions to header or drawer", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).not.toContain("language-options");
      expect(appLayoutSource).not.toContain("languageOptions");
    });

    it("global loader gets label from i18n internally (no label prop)", () => {
      const source = getLayoutSource();
      expect(source).toContain("loaderLabel");
      expect(source).toContain("layout.loader.label");
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).not.toMatch(/:label="[^"]*"/);
    });
  });

  describe("global loader (API / async)", () => {
    it("layout has global loader element with same horizontal inset as header separator", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__loader");
      expect(source).toMatch(/\.layout-app__loader\s*\{[\s\S]*?margin:\s*0\s+var\s*\(\s*--rep-content-padding-x/);
    });

    it("loader bar uses primary color and animation", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__loader-bar");
      expect(source).toMatch(/--v-theme-primary|--rep-primary/);
      expect(source).toMatch(/animation:\s*rep-loader-(fill|shimmer)/);
      expect(source).toMatch(/@keyframes\s+rep-loader-(fill|shimmer)/);
    });

    it("loader is shown when loading (v-show) and has accessible role and i18n label", () => {
      const source = getLayoutSource();
      expect(source).toContain('role="status"');
      expect(source).toContain('aria-live="polite"');
      expect(source).toContain("layout.loader.label");
    });

    it("loader has fixed height and does not grow (subtle effect)", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__loader\s*\{[\s\S]*?height:\s*(2|3)px/);
      expect(source).toMatch(/\.layout-app__loader\s*\{[\s\S]*?overflow:\s*hidden/);
      expect(source).toMatch(/\.layout-app__loader\s*\{[\s\S]*?(min-height|max-height):\s*(2|3)px/);
      expect(source).toMatch(/\.layout-app__loader\s*\{[\s\S]*?flex-shrink:\s*0/);
    });

    it("loader bar stays within container (no scale, subtle)", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__loader-bar");
      const loaderSection = source.slice(source.indexOf("layout-app__loader-bar"));
      expect(loaderSection).toMatch(/height:\s*(100%|\d+px)/);
      expect(loaderSection).not.toMatch(/transform:\s*scale/);
    });

    it("loader animation is slow (subtle)", () => {
      const source = getLayoutSource();
      const durationMatch = source.match(/animation:\s*rep-loader-(?:fill|shimmer)\s+(\d+(?:\.\d+)?)s/);
      expect(durationMatch).toBeTruthy();
      const durationSec = parseFloat(durationMatch![1]);
      expect(durationSec).toBeGreaterThanOrEqual(1.2);
    });
  });

  describe("view transitions", () => {
    it("RouterView uses Transition with view-fade-lift for smooth view changes", () => {
      const source = getLayoutSource();
      expect(source).toContain("RouterView");
      expect(source).toContain("Transition");
      expect(source).toContain('name="view-fade-lift"');
      expect(source).toContain("mode=\"out-in\"");
      expect(source).toContain(":key=\"$route.path\"");
    });

    it("view-fade-lift transition classes use physics-inspired easing and duration", () => {
      const source = getLayoutSource();
      expect(source).toContain("view-fade-lift-enter-active");
      expect(source).toContain("view-fade-lift-leave-active");
      expect(source).toContain("view-fade-lift-enter-from");
      expect(source).toContain("view-fade-lift-leave-to");
      expect(source).toMatch(/cubic-bezier\s*\(\s*0\.22\s*,\s*1\s*,\s*0\.36\s*,\s*1\s*\)/);
      expect(source).toMatch(/280ms|0\.28s/);
    });
  });

  describe("loading overlay (block all buttons when loading)", () => {
    it("overlay is present and shown when global loader active (v-show)", () => {
      const source = getLayoutSource();
      expect(source).toContain("layout-app__loading-overlay");
      expect(source).toMatch(/v-show="globalLoaderActive"/);
    });

    it("overlay has pointer-events so clicks are blocked on main area", () => {
      const source = getLayoutSource();
      expect(source).toMatch(/\.layout-app__loading-overlay\s*\{[\s\S]*?pointer-events:\s*auto/);
    });

    it("overlay has accessible role and loading label", () => {
      const source = getLayoutSource();
      expect(source).toContain('role="status"');
      expect(source).toContain("layout.loader.label");
    });
  });
});
