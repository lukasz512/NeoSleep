import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "AppFilterBar.vue");

function getAppFilterBarSource(): string {
  return readFileSync(componentPath, "utf-8");
}

describe("AppFilterBar", () => {
  it("uses VBadge with activeFilterCount so badge shows count when filters active", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain("VBadge");
    expect(source).toContain("activeFilterCount");
    expect(source).toMatch(/model-value="activeFilterCount\s*>\s*0"/);
  });

  it("accepts clearKey prop for i18n (Clear button lives in parent AppEntityList)", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain("clearKey");
  });

  it("emits clear (parent provides external Clear button)", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain('emit("clear")');
  });

  it("filter button has min touch target (app-filter-bar__btn with CSS var)", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain("app-filter-bar__btn");
    expect(source).toMatch(/--pwa-btn-min-(width|height)/);
  });

  it("filter button has no border (app-filter-bar__btn--no-border)", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain("app-filter-bar__btn--no-border");
    expect(source).toMatch(/border:\s*none|box-shadow:\s*none/);
  });

  it("filter button uses inline SVG icon (stroke, no VIcon) for visibility", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain("app-filter-bar__icon");
    expect(source).toMatch(/stroke="currentColor"/);
    expect(source).toContain("<svg");
  });

  it("filter button has size large to match add button", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain('size="large"');
  });

  it("VSelect uses chips and closable-chips when options have chipClass", () => {
    const source = getAppFilterBarSource();
    expect(source).toContain("chips");
    expect(source).toContain("closable-chips");
    expect(source).toContain("hasChipOptions");
    expect(source).toContain("pwa-lead-status-chip");
  });
});
