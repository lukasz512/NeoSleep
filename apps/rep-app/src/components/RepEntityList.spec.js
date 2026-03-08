import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "RepEntityList.vue");
function getRepEntityListSource() {
    return readFileSync(componentPath, "utf-8");
}
describe("RepEntityList", () => {
    describe("toolbar icons (filter and add)", () => {
        it("add button uses inline SVG plus icon for visibility (no VIcon)", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("rep-entity-list__add-icon");
            expect(source).toContain('<svg');
            expect(source).toMatch(/<line\s+x1="12"/);
            expect(source).toMatch(/stroke="currentColor"/);
            expect(source).not.toContain("VIcon");
        });
        it("add icon is plus-only without circular outline (no circle element)", () => {
            const source = getRepEntityListSource();
            const addIconBlock = source.slice(source.indexOf("rep-entity-list__add-icon"), source.indexOf("rep-entity-list__add-icon") + 400);
            expect(addIconBlock).not.toContain("<circle");
            expect(addIconBlock).toMatch(/<line\s+x1="12"\s+y1="8"/);
            expect(addIconBlock).toMatch(/<line\s+x1="8"\s+y1="12"/);
        });
        it("add button has no border (matches filter/sidebar style)", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("rep-entity-list__add--no-border");
            expect(source).toMatch(/border:\s*none|box-shadow:\s*none/);
        });
        it("add button has min 44px touch target on mobile", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("rep-entity-list__add");
            expect(source).toMatch(/min-width:\s*44px|min-height:\s*44px/);
        });
        it("add icon uses primary color on neutral background for contrast", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("rep-entity-list__add-icon");
            expect(source).toMatch(/--v-theme-primary/);
        });
        it("add button uses variant flat with neutral background for icon visibility", () => {
            const source = getRepEntityListSource();
            const addBtnStart = source.indexOf("showAddButton");
            const addBtnBlock = source.slice(addBtnStart, addBtnStart + 600);
            expect(addBtnBlock).toContain('variant="flat"');
            expect(addBtnBlock).toContain("rep-entity-list__add");
            expect(addBtnBlock).not.toContain('color="primary"');
        });
    });
    describe("list stagger animation (mobile feed)", () => {
        it("uses TransitionGroup with list-stagger for feed cards", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("TransitionGroup");
            expect(source).toContain('name="list-stagger"');
            expect(source).toContain("rep-entity-list__feed");
        });
        it("applies stagger delay per item via CSS variable", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("--stagger-delay");
            expect(source).toMatch(/index\s*\*\s*40/);
        });
        it("list-stagger transition uses physics-inspired easing", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("list-stagger-enter-active");
            expect(source).toContain("list-stagger-leave-active");
            expect(source).toContain("list-stagger-move");
            expect(source).toMatch(/cubic-bezier\s*\(\s*0\.22\s*,\s*1\s*,\s*0\.36\s*,\s*1\s*\)/);
            expect(source).toMatch(/280ms|0\.28s/);
        });
        it("leaving items use position absolute for smooth reflow", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("list-stagger-leave-active");
            expect(source).toMatch(/position:\s*absolute/);
        });
        it("feed container has position relative for absolute leaving items", () => {
            const source = getRepEntityListSource();
            expect(source).toContain("rep-entity-list__feed");
            expect(source).toContain("position: relative");
        });
    });
});
