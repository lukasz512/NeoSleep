import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// NEO-152: layout and motion rules of the list that jsdom can't lay out.
describe("AppEntityList styles (NEO-152)", () => {
  const css = readFileSync(path.resolve(__dirname, "AppEntityList.css"), "utf-8");
  const filterBar = readFileSync(path.resolve(__dirname, "AppFilterBar.vue"), "utf-8");
  const icons = readFileSync(path.resolve(__dirname, "AppIcon.vue"), "utf-8");

  it("the skeleton's header row is the table's: 40 px on the same strong rule", () => {
    expect(css).toMatch(/\.app-entity-list__skeleton-head \{\s*flex: none;\s*height: 40px;\s*box-shadow: inset 0 -1\.5px 0 var\(--pwa-rule-strong\);/);
    expect(css).toMatch(/:deep\(\.v-table > \.v-table__wrapper > table > thead > tr > th\) \{[\s\S]*?box-shadow: inset 0 -1\.5px 0 var\(--pwa-rule-strong\);/);
  });

  it("skeleton → list swaps in place: no fade out and back, no rise", () => {
    expect(css).toMatch(/\.app-entity-list__skeleton\.app-entity-list-swap-leave-active,\s*\.app-entity-list__table-wrap--from-skeleton\.app-entity-list-swap-enter-active \{\s*transition: none;/);
    expect(css).toMatch(/@keyframes app-entity-list-row-in \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}\s*\}/);
  });

  it("an open icon search lifts over the page-header row; the tools only fade (no width change)", () => {
    expect(css).toMatch(/\.app-entity-list__toolbar--overlay-open \.app-entity-list__search \{\s*position: absolute;\s*inset: 0;/);
    expect(css).toMatch(/\.app-entity-list__toolbar--overlay-open \.app-entity-list__tool \{\s*opacity: 0;\s*transform: scale\(0\.8\);\s*pointer-events: none;\s*\}/);
    expect(css).toMatch(/\.app-entity-list__toolbar--compact-search \.app-entity-list__search-slot \{\s*display: flex;\s*flex: 0 0 48px;/);
  });

  it("in the page header search, filter and + never wrap; the field fills the free room", () => {
    expect(css).toMatch(/\.app-entity-list__toolbar--in-header \{[^}]*flex-wrap: nowrap;/);
    expect(css).toMatch(/\.app-entity-list__toolbar--in-header \.app-entity-list__search-group \{\s*flex-wrap: nowrap;\s*flex: 1 1 auto;\s*justify-content: flex-end;/);
    expect(css).toMatch(/\.app-entity-list__toolbar--in-header:not\(\.app-entity-list__toolbar--mobile\) \{\s*margin-left: var\(--space-4, 16px\);/);
  });

  it("toolbar glyphs are all 22 px, and the funnel is drawn as wide as the magnifier", () => {
    expect(css).toMatch(/\.app-entity-list__search-icon \{\s*width: 22px;\s*height: 22px;/);
    expect(css).toMatch(/\.app-entity-list__icon \{\s*width: 22px;\s*height: 22px;/);
    expect(filterBar).toMatch(/\.app-filter-bar__icon \{[^}]*width: 22px;\s*height: 22px;/);
    expect(icons).toContain('points="20 5 4 5 10.5 12.4 10.5 18.2 13.5 19.7 13.5 12.4 20 5"');
    expect(icons).toContain('<circle cx="11" cy="11" r="7" pathLength="1" />');
  });

  it("the record header's actions match the list toolbar: 22 px glyphs, 8 px apart, 48 px on phones", () => {
    const detail = readFileSync(path.resolve(__dirname, "ItemDetailLayout.vue"), "utf-8");
    expect(detail).toMatch(/\.view-item__header-actions :deep\(\.view-item__action-icon\) \{\s*width: 22px;\s*height: 22px;/);
    expect(detail).toMatch(/\.view-item__record-header > \.view-item__header-actions \{\s*display: flex;\s*align-items: center;\s*gap: var\(--space-2, 8px\);/);
    expect(detail).toMatch(/\.view-item__header-actions :deep\(\.v-btn--icon\.v-btn--size-large\),\s*\.view-item__action-skeleton \{\s*width: 48px;\s*height: 48px;/);
    // Desktop: centred on the name row (eyebrow 16 + gap 4 + 32/2 − 56/2 = 8).
    expect(detail).toMatch(/gap: var\(--space-2, 8px\);[^}]*align-self: flex-start;\s*margin-top: 8px;/);
    // Phone: own row, on the right like the list toolbar.
    expect(detail).toMatch(/order: 3;\s*flex: 1 0 100%;\s*justify-content: flex-end;\s*align-self: auto;\s*margin: 0;/);
  });
});
