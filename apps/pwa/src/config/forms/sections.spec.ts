import { describe, expect, it, vi } from "vitest";
import { FORM_SECTION_IDS, type FormFieldDef } from "../../types/formField";
import en from "@i18n/en.json";
import { inSection } from "./sections";

// The configs import stores/API helpers for their async option loaders; none
// of them run here (only the static field list is read).
vi.mock("../../stores/auth", () => ({ useAuthStore: () => ({ user: null }) }));

const { patientFormFields } = await import("./patientForm");
const { hcpFormFields } = await import("./hcpForm");
const { hcoFormFields } = await import("./hcoForm");
const { leadFormFields } = await import("./leadForm");
const { userFormFields } = await import("./userForm");

/**
 * NEO-92: the entity forms with two or more sections open as the "Carpeta"
 * folder. Every field of these forms names its section explicitly, so a new
 * field can't silently fall into the wrong one.
 */
const FOLDER_FORMS: Record<string, FormFieldDef[]> = {
  patient: patientFormFields,
  hcp: hcpFormFields,
  hco: hcoFormFields,
  lead: leadFormFields,
  user: userFormFields,
};

describe("form sections (NEO-92)", () => {
  for (const [name, fields] of Object.entries(FOLDER_FORMS)) {
    it(`${name}: every field has a known section, and there are at least two`, () => {
      const missing = fields.filter((f) => !f.section).map((f) => f.key);
      expect(missing).toEqual([]);
      for (const f of fields) expect(FORM_SECTION_IDS).toContain(f.section);
      expect(new Set(fields.map((f) => f.section)).size).toBeGreaterThanOrEqual(2);
    });
  }

  it("every section id has an English label", () => {
    const labels = en as Record<string, string>;
    for (const id of [...FORM_SECTION_IDS, "default"]) {
      expect(labels[`app.formRenderer.section.${id}`], id).toBeTruthy();
    }
  });

  it("inSection tags copies, leaving the shared field objects untouched", () => {
    const field: FormFieldDef = { key: "x", type: "text", labelKey: "k" };
    const [tagged] = inSection("territory", field);
    expect(tagged.section).toBe("territory");
    expect(field.section).toBeUndefined();
  });
});
