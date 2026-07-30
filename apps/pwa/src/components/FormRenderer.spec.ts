import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getSource(): string {
  return readFileSync(path.resolve(__dirname, "FormRenderer.vue"), "utf-8");
}

describe("FormRenderer", () => {
  it("filters hidden fields (fn or boolean) before pairing cols:6 rows", () => {
    const source = getSource();
    expect(source).toContain("function isFieldHidden");
    expect(source).toMatch(/props\.fields\.filter\(\(f\)\s*=>\s*!isFieldHidden\(f\)\)/);
  });

  it("hidden/label/color functions receive the live form state, not just static flags", () => {
    const source = getSource();
    // Reactive to a sibling field's value (e.g. institution hidden/required
    // by the lead's `type`, or the clinic combobox's label/color flipping
    // once it stops matching an existing organization) — not just a
    // zero-arg closure reading an external store.
    expect(source).toMatch(/f\.hidden === "function" \? f\.hidden\(form\.value\)/);
    expect(source).toContain("function labelFor(f: FormFieldDef): string {");
    expect(source).toContain("function colorFor(f: FormFieldDef): string | undefined {");
    expect(source).toMatch(/f\.labelKey === "function" \? f\.labelKey\(form\.value\)/);
    expect(source).toMatch(/f\.color === "function" \? f\.color\(form\.value\)/);
    expect(source).toContain("label: labelFor(f)");
    expect(source).toContain("color: colorFor(f)");
  });

  it("maps type 'phone' to the PhoneField component and 'combobox' to VCombobox", () => {
    const source = getSource();
    expect(source).toContain('import PhoneField from "./PhoneField.vue"');
    expect(source).toMatch(/case "phone":\s*return PhoneField/);
    expect(source).toMatch(/case "combobox":\s*return VCombobox/);
  });

  it("imports real Vuetify component objects (not name strings) for componentFor()", () => {
    // A bare string like "VTextField" passed to `:is` only resolves if
    // vite-plugin-vuetify auto-registered that component for this specific
    // SFC — which only happens when it sees a literal <VTextField>-style tag
    // in the template. This file has no such literal tags (everything is
    // dynamic), so string-based resolution silently renders nothing. Real
    // imports sidestep that per-file auto-import detection entirely.
    const source = getSource();
    expect(source).toContain('import { VTextField, VSelect, VAutocomplete, VCombobox, VTextarea } from "vuetify/components"');
    expect(source).not.toMatch(/case "select":\s*return "VSelect"/);
    expect(source).not.toMatch(/default:\s*return "VTextField"/);
  });

  it("renders an AppIcon in #prepend-inner when a field has an icon", () => {
    const source = getSource();
    expect(source).toContain('import AppIcon from "./AppIcon.vue"');
    expect(source).toMatch(/v-if="f\.icon"\s*#prepend-inner/);
  });

  it("passes placeholder through to the underlying input", () => {
    const source = getSource();
    expect(source).toContain("f.placeholder ? t(f.placeholder) : undefined");
  });

  it("accepts derive and verifyInfoKey props and forwards derive into useFormRenderer", () => {
    const source = getSource();
    expect(source).toContain("derive?:");
    expect(source).toContain("verifyInfoKey?:");
    expect(source).toContain("useFormRenderer(props.fields, initialDataRef, props.derive)");
  });

  it("shows the verify-info banner only when verifyInfoKey is set", () => {
    const source = getSource();
    expect(source).toMatch(/v-if="verifyInfoKey"/);
  });
});
