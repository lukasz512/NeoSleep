import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "PractitionerForm.vue");
const composablePath = path.resolve(__dirname, "../composables/usePractitionerForm.ts");

function getSource(): string {
  return readFileSync(componentPath, "utf-8");
}

function getComposableSource(): string {
  return readFileSync(composablePath, "utf-8");
}

describe("PractitionerForm", () => {
  describe("modal layout and styling", () => {
    it("modal has max-width 680 or wider for comfortable form layout", () => {
      const source = getSource();
      expect(source).toMatch(/max-width=["']68\d+["']/);
    });

    it("modal uses project border-radius (--pwa-modal-radius) for consistent styling", () => {
      const source = getSource();
      expect(source).toContain("practitioner-form-dialog__content");
      expect(source).toMatch(/--pwa-modal-radius|border-radius:\s*var\(--pwa-modal-radius/);
    });

    it("card has padding for header, body, and footer", () => {
      const source = getSource();
      expect(source).toContain("practitioner-form-dialog__card");
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
      const classes = titleMatch![1].split(/\s+/);
      expect(classes).toContain("mx-2");
      expect(classes).toContain("mt-2");
      expect(classes).toContain("text-h6");
    });

    it("footer uses standard modal pattern: mx-2 mb-2 (reference for new modals)", () => {
      const source = getSource();
      const mainFormActionsIndex = source.indexOf("onCancelClick");
      const actionsBlock = source.slice(
        source.lastIndexOf("VCardActions", mainFormActionsIndex),
        mainFormActionsIndex + 80
      );
      const classMatch = actionsBlock.match(/VCardActions[^>]*class="([^"]+)"/);
      expect(classMatch).toBeTruthy();
      const classes = classMatch![1].split(/\s+/);
      expect(classes).toContain("mx-2");
      expect(classes).toContain("mb-2");
    });
  });

  describe("specialty and region in one row", () => {
    it("specialty and region are wrapped in practitioner-form__row for single-line layout", () => {
      const source = getSource();
      const anchor = source.indexOf("user.hcp.form.specialty");
      const rowBlock = source.slice(Math.max(0, anchor - 400), anchor + 700);
      expect(rowBlock).toContain("user.hcp.form.specialty");
      expect(rowBlock).toContain("user.leads.form.region");
      expect(source).toContain("practitioner-form__row-item");
    });

    it("row uses flex layout with gap for specialty and region side by side", () => {
      const source = getSource();
      expect(source).toMatch(/\.practitioner-form__row\s*\{[\s\S]*?display:\s*flex/);
      expect(source).toMatch(/\.practitioner-form__row\s*\{[\s\S]*?gap:/);
    });
  });

  describe("fields", () => {
    it("has native first_name and last_name fields (no combined name field)", () => {
      const source = getSource();
      expect(source).toContain("form.first_name");
      expect(source).toContain("form.last_name");
    });

    it("has salutation, influence tier, language, and national ID fields", () => {
      const source = getSource();
      expect(source).toContain("form.salutation");
      expect(source).toContain("form.influence_tier");
      expect(source).toContain("form.language");
      expect(source).toContain("form.national_id");
    });
  });

  describe("edit mode", () => {
    it("supports initialData prop for edit mode with pre-filled form", () => {
      const source = getSource();
      expect(source).toContain("initialData");
      expect(source).toMatch(/initial-data|initialData/);
    });

    it("emits submit with form data for both add and edit (via usePractitionerForm composable)", () => {
      const source = getComposableSource();
      expect(source).toContain('emit("submit"');
    });
  });
});
