import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import en from "@i18n/en.json";
import { navRoutesForRole } from "../router/routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_MODULE_ROUTES = [
  "dashboard", "leads", "planner", "hcp", "hco", "patients", "presentations", "users",
  "sleep-studies", "treatment-plans", "resources", "territories",
] as const;

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
      expect(appLayoutSource).toMatch(/import \{[^}]*\bAppShell\b[^}]*\} from "@ui"/);
      expect(appLayoutSource).toContain("<AppShell");
    });

    it("passes the role-filtered nav list into AppShell for the mobile bottom bar", () => {
      const appLayoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(appLayoutSource).toContain(":nav-items=\"visibleNavItems\"");
      expect(appLayoutSource).toContain("useVisibleNavRoutes");
    });

    // body below it become visually indistinguishable.
    it("app bar has an explicit surface color so it doesn't blend into the body background in dark mode", () => {
      const appShellSource = readFileSync(
        path.resolve(__dirname, "../../../../packages/ui/src/components/AppShell.vue"),
        "utf-8",
      );
      // NEO-85: a CSS variable instead of a Vuetify `color` prop, so the app can
      // tint it from the tenant's runtime primary (AppLayout sets it to the desk).
      expect(appShellSource).toMatch(
        /\.app-shell__bar,\s*\.app-shell__nav\s*{[^}]*background:\s*var\(--app-shell-chrome-fill\)/,
      );
      expect(appShellSource).toMatch(/--app-shell-chrome-fill:\s*var\(--app-shell-chrome, rgb\(var\(--v-theme-surface-container-low\)\)\)/);
      const layoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(layoutSource).toMatch(/--app-shell-chrome:\s*var\(--pwa-desk\)/);
    });

    it("routed content is a paper sheet on the desk (NEO-85 record stack)", () => {
      const layoutSource = readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
      expect(layoutSource).toMatch(/<AppShell[\s\S]*?\bsheet\b[\s\S]*?>/);
      expect(layoutSource).toMatch(/\.layout-main__inner\s*{[^}]*background:\s*var\(--pwa-sheet\)[^}]*box-shadow:\s*var\(--pwa-sheet-shadow\)/);
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

    // /presentations is meta.hidden (see routes.ts) — excluded from appNavRoutes entirely,
    // superseded by /resources. /dashboard is admin-only (2026-09-26) — every other
    // role's first entry (and home, see homePathForRole) is its first remaining module.
    it("rep sees every core module (leads, hcp, hco, patients, planner, resources) but not users, sleep-studies, treatment-plans, or territories", () => {
      const expectedPaths = ["/leads", "/hcp", "/hco", "/patients", "/planner", "/resources"];
      expect(navRoutesForRole("rep").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("manager sees users management, leads, sleep studies (NEO-83), treatment plans and documents — not territories", () => {
      const expectedPaths = [
        "/leads", "/hcp", "/hco", "/patients", "/sleep-studies",
        "/treatment-plans", "/planner", "/resources", "/users", "/documents",
      ];
      expect(navRoutesForRole("manager").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("kam and msl see leads, hcp, hco, patients, planner, resources but not users (same field-force access as rep)", () => {
      const expectedPaths = ["/leads", "/hcp", "/hco", "/patients", "/planner", "/resources"];
      expect(navRoutesForRole("kam").map((r) => r.path)).toEqual(expectedPaths);
      expect(navRoutesForRole("msl").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("admin always sees every nav item, including leads, documents, and territories (isRoleAllowed bypasses role restrictions for admin)", () => {
      const expectedPaths = [
        "/dashboard", "/leads", "/hcp", "/hco", "/patients", "/sleep-studies",
        "/treatment-plans", "/planner", "/resources", "/users", "/documents", "/territories",
      ];
      expect(navRoutesForRole("admin").map((r) => r.path)).toEqual(expectedPaths);
    });

    it("doctor sees patients, the clinical aggregates, planner, and resources — never leads, hcp, hco, or users", () => {
      const expectedPaths = ["/patients", "/sleep-studies", "/treatment-plans", "/planner", "/resources"];
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

  // NEO-55: logo top-left of the full-width app bar (desktop only), account
  // top-right (both breakpoints), module title in the content card's own
  // header row on desktop, no hamburger/mobile drawer — bottom bar + "More".
  describe("NEO-55 — app bar, page header and mobile navigation", () => {
    const readLayout = () => readFileSync(path.resolve(__dirname, "AppLayout.vue"), "utf-8");
    const readShell = () =>
      readFileSync(path.resolve(__dirname, "../../../../packages/ui/src/components/AppShell.vue"), "utf-8");
    const slotBlock = (source: string, slot: string) => {
      const start = source.indexOf(`<template #${slot}`);
      return source.slice(start, source.indexOf("\n      </template>", start));
    };

    it("app bar's leading slot renders the logo on desktop only and a back arrow on mobile detail views", () => {
      const block = slotBlock(readLayout(), "app-bar-start");
      expect(block).toMatch(/<div v-if="!isMobile" class="layout-appbar__brand">\s*<AppLogo/);
      expect(block).toMatch(/v-else-if="parentRoute"/);
      expect(block).toContain('name="arrow-left"');
    });

    it("the logo is no longer rendered inside the side menu or on the right of the app bar", () => {
      const shell = readShell();
      expect(shell).not.toContain('<slot name="logo"');
      expect(shell).not.toContain("app-shell__bar-logo");
      expect(shell).toContain('<slot name="app-bar-start"');
    });

    it("the account menu lives in the app bar's actions slot: a drop-down on desktop, a bottom sheet on phones (NEO-102)", () => {
      const layout = readLayout();
      const block = slotBlock(layout, "app-bar-actions");
      expect(block.match(/<AppUserMenuPanel\b/g)).toHaveLength(1);
      expect(block).toContain(':is="isMobile ? VBottomSheet : VMenu"');
      expect(layout).toMatch(/location: "bottom end"/);
      expect(block).toContain("user.initials");
      expect(block).toContain(':can-change-password="user.canChangePassword"');
      expect(block).toContain(':version="appVersion.version"');
      // Name + role next to the avatar on desktop only.
      expect(block).toMatch(/v-if="!isMobile" class="layout-user-info"/);
    });

    it("the drawer footer holds only the collapse toggle — no version label (moved to the account menu, NEO-102), no account button", () => {
      const block = slotBlock(readLayout(), "drawer-footer");
      expect(block).toContain("toggleSidebar");
      expect(block).not.toContain("appVersion");
      expect(block).not.toContain("AppUserMenuPanel");
      expect(block).not.toContain("VAvatar");
    });

    it("the collapse toggle is hidden behind SIDEBAR_COLLAPSE_ENABLED (off for now)", () => {
      const block = slotBlock(readLayout(), "drawer-footer");
      expect(block).toMatch(/v-if="SIDEBAR_COLLAPSE_ENABLED"\s+class="layout-nav-footer"/);
    });

    it("the account button never locks while a request is in flight (only view controls do)", () => {
      const block = slotBlock(readLayout(), "app-bar-actions");
      expect(block).toMatch(/class="layout-user-btn"[\s\S]*?ignore-global-loading/);
    });

    it("no notification bell, role-preview select, or theme panel sneaks into the app bar", () => {
      const source = readLayout();
      expect(source).not.toMatch(/<AppNotificationCenter\b/);
      expect(source).not.toMatch(/import\s+AppNotificationCenter\b/);
      expect(source).not.toContain("rolePreview");
      expect(source).not.toContain("VSelect");
    });

    it("the unread-notification nav dot pulse animation respects prefers-reduced-motion", () => {
      expect(readLayout()).toContain("prefers-reduced-motion");
    });

    it("desktop page header: back arrow on detail views, module title, and the teleport target for view controls", () => {
      const source = readLayout();
      const header = source.slice(source.indexOf('class="layout-page-header"') - 40, source.indexOf("<RouterView"));
      // NEO-56: also hidden while a detail view's record header replaces it.
      expect(source).toContain('<div v-show="!isMobile && !recordHeaderClaim" class="layout-page-header">');
      expect(source).toContain("provideRecordHeaderClaim()");
      expect(header).toMatch(/v-if="parentRoute"[\s\S]*?:to="parentRoute"/);
      expect(header).toContain("{{ moduleTitle }}");
      expect(header).toContain(':id="PAGE_HEADER_ACTIONS_ID"');
      expect(source).toContain("providePageHeader(");
    });

    it("the app bar title is mobile-only (desktop shows it in the page header instead)", () => {
      expect(slotBlock(readLayout(), "app-bar-title")).toMatch(/<Transition v-if="isMobile"/);
    });

    it("detail views show the parent module's title, not the detail route's own", () => {
      const source = readLayout();
      expect(source).toContain("navParentName(name)");
      expect(source).toMatch(/const name = parentName\.value \?\? route\.name/);
    });

    it("AppShell has no hamburger and renders the side menu on desktop only", () => {
      const shell = readShell();
      expect(shell).not.toContain("app-shell__hamburger");
      expect(shell).not.toContain(":temporary");
      expect(shell).toMatch(/<VNavigationDrawer\s+v-if="!mobile"/);
    });

    it("AppShell's bottom bar is the expanding MobileNavPanel: all nav items, first 4 in the bar, More/Close labels from i18n", () => {
      const shell = readShell();
      expect(shell).toMatch(/<MobileNavPanel[\s\S]*?:items="navItems"[\s\S]*?:primary-count="BOTTOM_NAV_ITEM_COUNT"/);
      expect(shell).not.toContain("<VBottomSheet");
      const layout = readLayout();
      expect(layout).toContain(":more-label=\"t('layout.nav.more')\"");
      expect(layout).toContain(":close-label=\"t('layout.nav.close')\"");
    });

    // Logo ↔ side-menu icons and avatar ↔ page-header icons must line up by
    // construction: the bar's edge insets are computed from the same tokens
    // that place the icons, never hand-tuned numbers of their own.
    it("app bar edge insets are derived from the nav/card tokens the icons use", () => {
      const layout = readLayout();
      expect(layout).toMatch(
        /--app-shell-bar-start-inset:\s*calc\(\s*var\(--layout-nav-inset\)\s*\+\s*var\(--layout-nav-item-inset\)\s*\+\s*var\(--layout-icon-ink-inset\)/,
      );
      expect(layout).toMatch(
        /--app-shell-bar-end-inset:\s*calc\(\s*var\(--layout-card-inset\)\s*\+\s*var\(--layout-action-icon-inset\)/,
      );
      expect(layout).toMatch(/\.layout-main__inner\s*\{\s*padding:\s*var\(--layout-card-inset\)/);

      const navLinks = readFileSync(path.resolve(__dirname, "components/AppNavLinks.vue"), "utf-8");
      expect(navLinks).toContain("var(--layout-nav-inset");
      expect(navLinks).toContain("var(--layout-nav-item-inset");

      const shell = readShell();
      expect(shell).toContain("padding-inline-start: var(--app-shell-bar-start-inset");
      expect(shell).toContain("padding-inline-end: var(--app-shell-bar-end-inset");

      // The logo link itself adds no inline offset on top of the shell inset.
      const logo = readFileSync(path.resolve(__dirname, "components/AppLogo.vue"), "utf-8");
      expect(logo).toMatch(/\.layout-app__bar-logo-link\s*\{[\s\S]*?padding:\s*8px 0;/);
    });

    // Mobile: the bar's leading element (module icon / back arrow) and the
    // desktop page-header title start on the content edge (card inset).
    it("title icon and back arrow are placed from the card inset, the icon's glyph margin measured, not guessed", () => {
      const layout = readLayout();
      expect(layout).toMatch(/--app-shell-title-inset:\s*var\(--layout-card-inset\)/);
      expect(layout).toMatch(
        /--app-shell-bar-start-inset:\s*calc\(\s*var\(--layout-card-inset\)\s*-\s*var\(--layout-back-btn-icon-inset\)\s*-\s*var\(--layout-back-arrow-ink-inset\)/,
      );
      expect(layout).toMatch(
        /\.layout-page-header__back\s*\{[\s\S]*?margin-inline-start:\s*calc\(-1 \* \(var\(--layout-action-icon-inset\) \+ var\(--layout-back-arrow-ink-inset\)\)\)/,
      );
      expect(layout).toContain("useGlyphInset(isMobile)");
      expect(layout.match(/marginInlineStart: `\$\{-\w+TitleGlyph\.inset\.value\}px`/g)).toHaveLength(2);
      expect(readShell()).toContain("margin-inline-start: var(--app-shell-title-inset");
    });

    it("collapse chevron button is 32px with right-edge margin", () => {
      const rule = readLayout().match(/\.layout-collapse-btn\s*\{[\s\S]*?\}/)?.[0] ?? "";
      expect(rule).toMatch(/width:\s*32px/);
      expect(rule).toMatch(/height:\s*32px/);
      expect(rule).toMatch(/margin-inline-end:\s*8px/);
    });

    it("account button has no custom hover/focus size animation (two prior attempts both looked broken live)", () => {
      const source = readLayout();
      const rule = source.match(/(?<!--compact )\.layout-user-btn\s*\{[\s\S]*?\}/)?.[0] ?? "";
      expect(rule).not.toMatch(/transition/);
      expect(source).not.toMatch(/\.layout-user-btn:hover/);
      expect(source).not.toMatch(/\.layout-user-btn[\s\S]{0,400}transform:\s*scale/);
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
