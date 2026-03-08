import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "LeadContactForm.vue");
function getSource() {
    return readFileSync(componentPath, "utf-8");
}
describe("LeadContactForm", () => {
    describe("modal layout and styling", () => {
        it("modal has max-width 680 or wider for comfortable form layout", () => {
            const source = getSource();
            expect(source).toMatch(/max-width=["']68\d+["']/);
        });
        it("modal uses project border-radius (--rep-modal-radius) for consistent styling", () => {
            const source = getSource();
            expect(source).toContain("lead-contact-form-dialog__content");
            expect(source).toMatch(/--rep-modal-radius|border-radius:\s*var\(--rep-modal-radius/);
        });
        it("card has padding for header, body, and footer", () => {
            const source = getSource();
            expect(source).toContain("lead-contact-form-dialog__card");
            expect(source).toContain(".v-card-title");
            expect(source).toContain(".v-card-text");
            expect(source).toContain(".v-card-actions");
            expect(source).toMatch(/v-card-title[\s\S]*?padding/);
            expect(source).toMatch(/v-card-text[\s\S]*?24px/);
            expect(source).toMatch(/v-card-actions[\s\S]*?padding/);
        });
        it("header uses standard modal pattern: mx-2 mt-2 text-h6 (reference for new modals)", () => {
            const source = getSource();
            const titleMatch = source.match(/VCardTitle[^>]*class="([^"]+)"/);
            expect(titleMatch).toBeTruthy();
            const classes = titleMatch[1].split(/\s+/);
            expect(classes).toContain("mx-2");
            expect(classes).toContain("mt-2");
            expect(classes).toContain("text-h6");
        });
        it("footer uses standard modal pattern: mx-2 mb-2 (reference for new modals)", () => {
            const source = getSource();
            const mainFormActionsIndex = source.indexOf("onCancelClick");
            const actionsBlock = source.slice(source.lastIndexOf("VCardActions", mainFormActionsIndex), mainFormActionsIndex + 80);
            const classMatch = actionsBlock.match(/VCardActions[^>]*class="([^"]+)"/);
            expect(classMatch).toBeTruthy();
            const classes = classMatch[1].split(/\s+/);
            expect(classes).toContain("mx-2");
            expect(classes).toContain("mb-2");
        });
    });
    describe("lead form layout", () => {
        it("status and region are in the same row for lead mode", () => {
            const source = getSource();
            const rowBlock = source.slice(source.indexOf("lead-contact-form__row"), source.indexOf("lead-contact-form__row") + 800);
            expect(rowBlock).toContain("rep.leads.form.status");
            expect(rowBlock).toContain("rep.leads.form.region");
            expect(rowBlock).toContain("lead-contact-form__row-item");
        });
    });
    describe("specialty and region in one row", () => {
        it("specialty and region are wrapped in lead-contact-form__row for single-line layout", () => {
            const source = getSource();
            expect(source).toContain("lead-contact-form__row");
            expect(source).toContain("lead-contact-form__row-item");
        });
        it("row uses flex layout with gap for specialty and region side by side", () => {
            const source = getSource();
            expect(source).toMatch(/\.lead-contact-form__row\s*\{[\s\S]*?display:\s*flex/);
            expect(source).toMatch(/\.lead-contact-form__row\s*\{[\s\S]*?gap:/);
        });
    });
    describe("edit mode", () => {
        it("supports initialData prop for edit mode with pre-filled form", () => {
            const source = getSource();
            expect(source).toContain("initialData");
            expect(source).toMatch(/initial-data|initialData/);
        });
        it("emits submit with form data for both add and edit", () => {
            const source = getSource();
            expect(source).toContain('emit("submit"');
        });
    });
});
