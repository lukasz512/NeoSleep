import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// NEO-121: minimal table footer on the 4 px grid, aligned to the rows.
describe("AppEntityList table footer (NEO-121)", () => {
  const css = readFileSync(path.resolve(__dirname, "AppEntityList.css"), "utf-8");

  // NEO-152: out to the card's edges (the whole sheet padding), the skeleton too.
  it("runs the table (and its skeleton) through the sheet padding to the card's edges", () => {
    expect(css).toMatch(
      /\.app-entity-list__table-wrap:not\(\.app-entity-list__table-wrap--flat\),\s*\.app-entity-list__skeleton:not\(\.app-entity-list__skeleton--mobile\)\s*\{\s*margin-inline: calc\(-1 \* var\(--layout-card-inset, 16px\)\);/,
    );
  });

  it("pads the outer cells by the card inset so content stays on the page title's line", () => {
    expect(css).toMatch(/> tr > :first-child\) \{\s*padding-inline-start: var\(--layout-card-inset, 16px\);/);
    expect(css).toMatch(/> tr > :last-child\) \{\s*padding-inline-end: var\(--layout-card-inset, 16px\);/);
  });

  it("is one 48 px row, 8 px below the rows, 14 px text", () => {
    expect(css).toMatch(/:deep\(\.v-data-table-footer\) \{\s*min-height: 48px;\s*margin-top: var\(--space-2, 8px\);\s*padding: 0 var\(--layout-card-inset, 16px\);/);
    expect(css).toMatch(/font-size: 0\.875rem;\s*font-variant-numeric: tabular-nums;/);
  });

  it("shows only previous / next, 8 px apart, as hairline chevrons", () => {
    expect(css).toMatch(/:deep\(\.v-pagination__first\),\s*\.app-entity-list__table-wrap :deep\(\.v-pagination__last\) \{\s*display: none;/);
    expect(css).toMatch(/:deep\(\.v-pagination__list\) \{\s*gap: var\(--space-2, 8px\);/);
    expect(css).toContain("stroke-width='1.25'");
  });

  it("hides the rows-per-page words (the select keeps them as its aria-label)", () => {
    expect(css).toMatch(/:deep\(\.v-data-table-footer__items-per-page > span\) \{\s*display: none;/);
  });
});
