import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "RepFilterBar.vue");
function getRepFilterBarSource() {
    return readFileSync(componentPath, "utf-8");
}
describe("RepFilterBar", () => {
    it("uses VBadge with activeFilterCount so badge shows count when filters active", () => {
        const source = getRepFilterBarSource();
        expect(source).toContain("VBadge");
        expect(source).toContain("activeFilterCount");
        expect(source).toMatch(/model-value="activeFilterCount\s*>\s*0"/);
    });
    it("has a Clear button with rep-filter-bar__clear class for accessibility", () => {
        const source = getRepFilterBarSource();
        expect(source).toContain("rep-filter-bar__clear");
        expect(source).toContain("clearKey");
    });
    it("emits clear when Clear is clicked", () => {
        const source = getRepFilterBarSource();
        expect(source).toMatch(/@click="onClear"/);
        expect(source).toContain('emit("clear")');
    });
    it("filter button has min touch target (rep-filter-bar__btn with CSS var)", () => {
        const source = getRepFilterBarSource();
        expect(source).toContain("rep-filter-bar__btn");
        expect(source).toMatch(/--rep-btn-min-(width|height)/);
    });
    it("filter button has no border (rep-filter-bar__btn--no-border)", () => {
        const source = getRepFilterBarSource();
        expect(source).toContain("rep-filter-bar__btn--no-border");
        expect(source).toMatch(/border:\s*none|box-shadow:\s*none/);
    });
    it("filter button uses inline SVG icon (stroke, no VIcon) for visibility", () => {
        const source = getRepFilterBarSource();
        expect(source).toContain("rep-filter-bar__icon");
        expect(source).toMatch(/stroke="currentColor"/);
        expect(source).toContain("<svg");
    });
    it("filter button has size large to match add button", () => {
        const source = getRepFilterBarSource();
        expect(source).toContain('size="large"');
    });
});
