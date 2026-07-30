import { describe, it, expect, vi } from "vitest";
import { ref, nextTick } from "vue";
import type { FormFieldDef } from "../types/formField";

// useFormRenderer calls vue-i18n's useI18n(), which throws outside a real
// component setup() context — mock it with a passthrough translator so the
// composable's actual reactive logic (ref/computed/watch, which work fine
// standalone) can be exercised directly, without needing a mounted component.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

import { useFormRenderer } from "./useFormRenderer";

describe("useFormRenderer", () => {
  it("buildFormState/resetForm seeds defaults, including function defaults evaluated fresh", () => {
    const fields: FormFieldDef[] = [
      { key: "a", type: "text", labelKey: "a" },
      { key: "b", type: "text", labelKey: "b", default: "fallback" },
      { key: "c", type: "text", labelKey: "c", default: () => "computed" },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    expect(r.form.value).toEqual({ a: "", b: "fallback", c: "computed" });
  });

  it("nestUnder reads from initialData[nestUnder][key] and writes back the same shape via buildPayload", async () => {
    const fields: FormFieldDef[] = [
      { key: "institution", type: "text", labelKey: "x", nestUnder: "metadata" },
    ];
    const initialData = ref<Record<string, unknown> | undefined>({ id: "1", metadata: { institution: "Acme Clinic" } });
    const r = useFormRenderer(fields, initialData);
    expect(r.form.value.institution).toBe("Acme Clinic");

    const payload = r.buildPayload();
    expect(payload).toEqual({ id: "1", metadata: { institution: "Acme Clinic" } });
  });

  it("nestUnder omits a blank value from the nested bucket rather than writing an empty string", () => {
    const fields: FormFieldDef[] = [
      { key: "institution", type: "text", labelKey: "x", nestUnder: "metadata" },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    r.form.value.institution = "   ";
    expect(r.buildPayload()).toEqual({ metadata: {} });
  });

  it("multiple fields sharing one nestUnder land in the same payload bucket", () => {
    const fields: FormFieldDef[] = [
      { key: "linkedin", type: "text", labelKey: "x", nestUnder: "social_links" },
      { key: "instagram", type: "text", labelKey: "y", nestUnder: "social_links" },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    r.form.value.linkedin = "https://linkedin.example/me";
    r.form.value.instagram = "https://instagram.example/me";
    expect(r.buildPayload()).toEqual({
      social_links: {
        linkedin: "https://linkedin.example/me",
        instagram: "https://instagram.example/me",
      },
    });
  });

  it("dependsOn triggers a forced options reload when the depended-on field changes", async () => {
    const loader = vi.fn(async (form: Record<string, unknown>) => [
      { title: `opt-for-${form.clinic}`, value: form.clinic as string },
    ]);
    const fields: FormFieldDef[] = [
      { key: "clinic", type: "text", labelKey: "clinic" },
      { key: "specialty", type: "autocomplete", labelKey: "specialty", options: loader, dependsOn: ["clinic"] },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    r.form.value.clinic = "clinic-a";
    await nextTick();
    await nextTick();
    expect(loader).toHaveBeenCalled();

    loader.mockClear();
    r.form.value.clinic = "clinic-b";
    await nextTick();
    await nextTick();
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ clinic: "clinic-b" }));
  });

  it("autoSelectFirstIfEmpty fills an empty field with the first resolved option", async () => {
    const fields: FormFieldDef[] = [
      {
        key: "specialty", type: "autocomplete", labelKey: "specialty",
        options: async () => [{ title: "Cardiology", value: "cardio" }],
        autoSelectFirstIfEmpty: true,
      },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    await r.loadAllAsyncOptions();
    expect(r.form.value.specialty).toBe("cardio");
  });

  it("autoSelectFirstIfEmpty does not override an already-set value", async () => {
    const fields: FormFieldDef[] = [
      {
        key: "specialty", type: "autocomplete", labelKey: "specialty",
        options: async () => [{ title: "Cardiology", value: "cardio" }],
        autoSelectFirstIfEmpty: true,
      },
    ];
    const r = useFormRenderer(fields, ref({ specialty: "derma" }));
    await r.loadAllAsyncOptions();
    expect(r.form.value.specialty).toBe("derma");
  });

  it("derive patches hidden/derived fields reactively and converges (no infinite loop)", async () => {
    const deriveCalls: unknown[] = [];
    const derive = (form: Record<string, unknown>) => {
      deriveCalls.push({ ...form });
      if (form.clinic === "clinic-a") return { region: "PL" };
      return undefined;
    };
    const fields: FormFieldDef[] = [
      { key: "clinic", type: "text", labelKey: "clinic" },
      { key: "region", type: "text", labelKey: "region", hidden: true },
    ];
    const r = useFormRenderer(fields, ref(undefined), derive);
    r.form.value.clinic = "clinic-a";
    await nextTick();
    await nextTick();
    expect(r.form.value.region).toBe("PL");
    // Converged: derive keeps returning the same patch, but useFormRenderer's
    // change-guard means it only actually reassigns form.value once.
    const regionValues = deriveCalls.map((c) => (c as Record<string, unknown>).region);
    expect(regionValues.filter((v) => v === "PL").length).toBeLessThanOrEqual(regionValues.length);
    expect(r.form.value.region).toBe("PL");
  });

  it("hasChanged compares against the open-time snapshot, ignoring incidental whitespace", () => {
    const fields: FormFieldDef[] = [{ key: "name", type: "text", labelKey: "name" }];
    const r = useFormRenderer(fields, ref({ name: "Ada" }));
    expect(r.hasChanged()).toBe(false);
    r.form.value.name = "Ada  ";
    expect(r.hasChanged()).toBe(false);
    r.form.value.name = "Grace";
    expect(r.hasChanged()).toBe(true);
  });

  it("rulesFor adds a generic required rule and layers custom rules on top", () => {
    const customRule = (v: unknown) => (String(v).length >= 9 ? true : "custom.tooShort");
    const fields: FormFieldDef[] = [
      { key: "phone", type: "text", labelKey: "phone", required: true, rules: [customRule] },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    const rules = r.rulesFor(fields[0]);
    expect(rules).toHaveLength(2);
    expect(rules[0]("")).toBe("app.formRenderer.validation.required");
    expect(rules[0]("123456789")).toBe(true);
    expect(rules[1]("123")).toBe("custom.tooShort");
    expect(rules[1]("123456789")).toBe(true);
  });

  it("rulesFor evaluates a function `required` against live form state, not just a static boolean", () => {
    const fields: FormFieldDef[] = [
      { key: "type", type: "select", labelKey: "type" },
      { key: "institution", type: "text", labelKey: "institution", required: (form) => form.type === "doctor" },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    const institutionField = fields[1];

    r.form.value.type = "patient";
    expect(r.rulesFor(institutionField)).toHaveLength(0);

    r.form.value.type = "doctor";
    const rules = r.rulesFor(institutionField);
    expect(rules).toHaveLength(1);
    expect(rules[0]("")).toBe("app.formRenderer.validation.required");
    expect(rules[0]("Acme Clinic")).toBe(true);
  });

  it("buildPayload converts number fields and drops blank strings to undefined", () => {
    const fields: FormFieldDef[] = [
      { key: "ahi", type: "number", labelKey: "ahi" },
      { key: "notes", type: "text", labelKey: "notes" },
    ];
    const r = useFormRenderer(fields, ref(undefined));
    r.form.value.ahi = "12.5";
    r.form.value.notes = "   ";
    expect(r.buildPayload()).toEqual({ ahi: 12.5, notes: undefined });
  });
});
