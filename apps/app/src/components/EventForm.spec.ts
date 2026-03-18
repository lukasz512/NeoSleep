import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "EventForm.vue");

function getSource(): string {
  return readFileSync(componentPath, "utf-8");
}

describe("EventForm", () => {
  describe("modal layout and styling", () => {
    it("modal has max-width 680 or wider for comfortable form layout", () => {
      const source = getSource();
      expect(source).toMatch(/max-width=["']68\d+["']/);
    });

    it("modal uses project border-radius (--rep-modal-radius) for consistent styling", () => {
      const source = getSource();
      expect(source).toContain("event-form-dialog__content");
      expect(source).toMatch(/--rep-modal-radius|border-radius:\s*var\(--rep-modal-radius/);
    });

    it("card has padding for header, body, and footer", () => {
      const source = getSource();
      expect(source).toContain("event-form-dialog__card");
      expect(source).toContain(".v-card-title");
      expect(source).toContain(".v-card-text");
      expect(source).toContain(".v-card-actions");
    });

    it("header uses standard modal pattern: mx-2 mt-2 text-h6", () => {
      const source = getSource();
      const titleMatch = source.match(/VCardTitle[^>]*class="([^"]+)"/);
      expect(titleMatch).toBeTruthy();
      const classes = titleMatch![1].split(/\s+/);
      expect(classes).toContain("mx-2");
      expect(classes).toContain("mt-2");
      expect(classes).toContain("text-h6");
    });

    it("footer uses standard modal pattern: mx-2 mb-2", () => {
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

  describe("form fields", () => {
    it("has title, start, end, type, status fields", () => {
      const source = getSource();
      expect(source).toContain("rep.planner.form.fieldTitle");
      expect(source).toContain("rep.planner.form.fieldStart");
      expect(source).toContain("rep.planner.form.fieldEnd");
      expect(source).toContain("rep.planner.form.fieldType");
      expect(source).toContain("rep.planner.form.fieldStatus");
    });

    it("has HCO and HCP multi-select fields", () => {
      const source = getSource();
      expect(source).toContain("rep.planner.form.fieldHco");
      expect(source).toContain("rep.planner.form.fieldHcp");
      expect(source).toMatch(/VAutocomplete|v-autocomplete/);
      expect(source).toContain("multiple");
    });

    it("has location for F2F and video link for video type", () => {
      const source = getSource();
      expect(source).toContain("rep.planner.form.fieldLocation");
      expect(source).toContain("rep.planner.form.fieldVideoLink");
      expect(source).toMatch(/v-if.*form\.type.*f2f|form\.type === ['\"]f2f['\"]/);
      expect(source).toMatch(/v-if.*form\.type.*video|form\.type === ['\"]video['\"]/);
    });

    it("row layout uses event-form__row for start/end and type/status", () => {
      const source = getSource();
      expect(source).toContain("event-form__row");
      expect(source).toContain("event-form__row-item");
    });
  });

  describe("edit mode", () => {
    it("supports initialData prop for edit mode with pre-filled form", () => {
      const source = getSource();
      expect(source).toContain("initialData");
      expect(source).toMatch(/initial-data|initialData/);
    });

    it("emits submit with form payload", () => {
      const source = getSource();
      expect(source).toContain('emit("submit"');
    });
  });

  describe("accessibility", () => {
    it("uses VBtn for actions (project uses Vuetify components)", () => {
      const source = getSource();
      expect(source).toContain("VBtn");
    });
  });
});
