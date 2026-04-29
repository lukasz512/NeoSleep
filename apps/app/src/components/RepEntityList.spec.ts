import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "AppEntityList.vue");

function getAppEntityListSource(): string {
  return readFileSync(componentPath, "utf-8");
}

describe("AppEntityList", () => {
  describe("toolbar icons (filter and add)", () => {
    it("Clear filters button is outside menu, left of filter icon, icon in primary color (via CSS), shown when activeFilterCount > 0", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__clear-filters");
      expect(source).toContain("activeFilterCount > 0");
      expect(source).toMatch(/--v-theme-primary/);
      expect(source).toContain("i18n.filtersClear");
    });
    it("add button uses inline SVG plus icon for visibility (no VIcon)", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__add-icon");
      expect(source).toContain('<svg');
      expect(source).toMatch(/<line\s+x1="12"/);
      expect(source).toMatch(/stroke="currentColor"/);
      expect(source).not.toContain("VIcon");
    });

    it("add icon is plus-only without circular outline (no circle element)", () => {
      const source = getAppEntityListSource();
      const addIconBlock = source.slice(
        source.indexOf("app-entity-list__add-icon"),
        source.indexOf("app-entity-list__add-icon") + 400
      );
      expect(addIconBlock).not.toContain("<circle");
      expect(addIconBlock).toMatch(/<line\s+x1="12"\s+y1="8"/);
      expect(addIconBlock).toMatch(/<line\s+x1="8"\s+y1="12"/);
    });

    it("add button has no border (matches filter/sidebar style)", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__add--no-border");
      expect(source).toMatch(/border:\s*none|box-shadow:\s*none/);
    });

    it("add button has min 44px touch target on mobile", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__add");
      expect(source).toMatch(/min-width:\s*44px|min-height:\s*44px/);
    });

    it("add icon uses primary color on neutral background for contrast", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__add-icon");
      expect(source).toMatch(/--v-theme-primary/);
    });

    it("add button uses variant flat with neutral background for icon visibility", () => {
      const source = getAppEntityListSource();
      const addBtnStart = source.indexOf("showAddButton");
      const addBtnBlock = source.slice(addBtnStart, addBtnStart + 600);
      expect(addBtnBlock).toContain('variant="flat"');
      expect(addBtnBlock).toContain("app-entity-list__add");
      expect(addBtnBlock).not.toContain('color="primary"');
    });
  });

  describe("list stagger animation (mobile feed)", () => {
    it("uses TransitionGroup with list-stagger for feed cards", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("TransitionGroup");
      expect(source).toContain('name="list-stagger"');
      expect(source).toContain("app-entity-list__feed");
    });

    it("applies stagger delay per item via CSS variable", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("--stagger-delay");
      expect(source).toMatch(/index\s*\*\s*40/);
    });

    it("list-stagger transition uses physics-inspired easing", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("list-stagger-enter-active");
      expect(source).toContain("list-stagger-leave-active");
      expect(source).toContain("list-stagger-move");
      expect(source).toMatch(/cubic-bezier\s*\(\s*0\.22\s*,\s*1\s*,\s*0\.36\s*,\s*1\s*\)/);
      expect(source).toMatch(/280ms|0\.28s/);
    });

    it("leaving items use position absolute for smooth reflow", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("list-stagger-leave-active");
      expect(source).toMatch(/position:\s*absolute/);
    });

    it("feed container has position relative for absolute leaving items", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__feed");
      expect(source).toContain("position: relative");
    });
  });

  describe("no-results placeholder (filtered empty state)", () => {
    it("has icon above title for visual feedback", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__no-results-icon-wrap");
      expect(source).toContain("app-entity-list__no-results-icon");
      expect(source).toContain("app-entity-list__no-results-placeholder");
    });

    it("icon uses magnifying glass SVG (search / no results metaphor)", () => {
      const source = getAppEntityListSource();
      const iconBlock = source.slice(
        source.indexOf("app-entity-list__no-results-icon"),
        source.indexOf("app-entity-list__no-results-icon") + 400
      );
      expect(iconBlock).toContain("<circle");
      expect(iconBlock).toContain("<line");
      expect(iconBlock).toMatch(/stroke="currentColor"/);
    });

    it("icon has aria-hidden for decorative use", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__no-results-icon-wrap");
      expect(source).toMatch(/aria-hidden=["']true["']/);
    });
  });

  describe("search input clear button", () => {
    it("search input has append-inner clear button when content (same X icon as filters)", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__search-clear");
      expect(source).toContain("append-inner");
      expect(source).toContain("searchQuery.trim()");
      expect(source).toMatch(/path d="M18 6L6 18M6 6l12 12"/);
    });

    it("search clear is hidden on mobile (desktop-only); toolbar clear is the single clear on mobile", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("app-entity-list__search-clear--desktop-only");
      expect(source).toMatch(/767px/);
      expect(source).toMatch(/display:\s*none/);
    });

    it("toolbar clear shows when search or filters active (hasActiveFiltersOrSearch)", () => {
      const source = getAppEntityListSource();
      expect(source).toContain("hasActiveFiltersOrSearch");
      expect(source).not.toMatch(/v-if="activeFilterCount > 0"/);
    });
  });
});
