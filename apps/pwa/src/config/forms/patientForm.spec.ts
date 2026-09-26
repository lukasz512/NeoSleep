import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../composables/useApi")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { createPinia, setActivePinia } from "pinia";
import { patientFormFields, patientFormDerive } from "./patientForm";
import { useConfigStore } from "../../stores/config";
import type { FormFieldOption } from "../../types/formField";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

describe("patientFormFields", () => {
  it("leads with the shared Identity block, prefix key renamed to 'salutation'", () => {
    expect(patientFormFields.slice(0, 5).map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone",
    ]);
    expect(patientFormFields[0].labelKey).toBe("app.identity.form.prefix");
  });

  it("practitioner_id is an autocomplete with an async loader", () => {
    const practitioner = patientFormFields.find((f) => f.key === "practitioner_id")!;
    expect(practitioner.type).toBe("autocomplete");
    expect(typeof practitioner.options).toBe("function");
  });

  it("status defaults to active; ahi_baseline is a number field", () => {
    const status = patientFormFields.find((f) => f.key === "status")!;
    const ahi = patientFormFields.find((f) => f.key === "ahi_baseline")!;
    expect(status.default).toBe("active");
    expect(ahi.type).toBe("number");
  });

  it("sex and date of birth are required for a patient", () => {
    const byKey = Object.fromEntries(patientFormFields.map((f) => [f.key, f]));
    expect(byKey.gender.required).toBe(true);
    expect(byKey.date_of_birth.required).toBe(true);
  });

  it("sex is two chips (♀/♂) with Otro / Prefiero no decir as secondary links", () => {
    const gender = patientFormFields.find((f) => f.key === "gender")!;
    expect(gender.type).toBe("choice");
    const opts = gender.options as FormFieldOption[];
    expect(opts.filter((o) => !o.secondary).map((o) => [o.value, o.symbol])).toEqual([["female", "♀"], ["male", "♂"]]);
    expect(opts.filter((o) => o.secondary).map((o) => o.value)).toEqual(["other", "prefer_not_to_say"]);
  });

  describe("patientFormDerive — salutation and sex move together", () => {
    const run = (prev: Record<string, unknown>, form: Record<string, unknown>) => patientFormDerive(form, prev);

    it.each([
      ["Dr.", "male"], ["Dra.", "female"], ["Sr.", "male"], ["Sra.", "female"], ["dra", "female"],
      ["Prof.", "male"], ["Profa.", "female"], ["Lic.", "male"], ["Licda.", "female"],
    ])("picking salutation %s sets sex to %s", (salutation, gender) => {
      expect(run({ salutation: null, gender: null }, { salutation, gender: null })).toEqual({ gender });
    });

    it("switching salutation Dra. → Dr. flips a female patient to male", () => {
      expect(run({ salutation: "Dra.", gender: "female" }, { salutation: "Dr.", gender: "female" })).toEqual({ gender: "male" });
    });

    it.each([
      ["male", "Dra.", "Dr."], ["female", "Dr.", "Dra."], ["male", "Sra.", "Sr."], ["female", "Sr.", "Sra."],
      ["female", "Prof.", "Profa."], ["male", "Profa.", "Prof."], ["female", "Lic.", "Licda."], ["male", "Licda.", "Lic."],
    ])("picking sex %s turns %s into %s", (gender, salutation, expected) => {
      expect(run({ salutation, gender: null }, { salutation, gender })).toEqual({ salutation: expected });
    });

    it("sex never invents a salutation, and leaves the gender-neutral Mgr. alone (both ways)", () => {
      expect(run({ salutation: null, gender: null }, { salutation: null, gender: "female" })).toBeUndefined();
      expect(run({ salutation: "Mgr.", gender: "male" }, { salutation: "Mgr.", gender: "female" })).toBeUndefined();
      expect(run({ salutation: null, gender: null }, { salutation: "Mgr.", gender: null })).toBeUndefined();
    });

    it("Otro / Prefiero no decir is a manual choice: the salutation no longer changes sex", () => {
      expect(run({ salutation: "Dra.", gender: "other" }, { salutation: "Dr.", gender: "other" })).toBeUndefined();
      expect(run({ salutation: null, gender: "prefer_not_to_say" }, { salutation: "Dra.", gender: "prefer_not_to_say" })).toBeUndefined();
    });

    it("picking Otro / Prefiero no decir leaves the salutation as it is", () => {
      expect(run({ salutation: "Dra.", gender: "female" }, { salutation: "Dra.", gender: "other" })).toBeUndefined();
    });

    it("an already-consistent pair, or both changing at once (record just opened), is left alone", () => {
      expect(run({ salutation: "Dr.", gender: null }, { salutation: "Dr.", gender: "male" })).toBeUndefined();
      expect(run({}, { salutation: "Dra.", gender: "male" })).toBeUndefined();
    });
  });

  it("carries the full existing field set (no fields dropped in the migration)", () => {
    expect(patientFormFields.map((f) => f.key)).toEqual([
      "salutation", "first_name", "last_name", "email", "phone", "gender", "date_of_birth",
      "practitioner_id", "status", "region", "territory_id", "country_code", "ahi_baseline", "cpap_device", "medical_record",
    ]);
  });

  // ADR-020's region-scoping fix (middleware/requireScope.ts) needs country_code
  // populated on every patient — hidden, defaulted from the creating user's own
  // country, same pattern as hcoForm.ts's country_code field.
  it("country_code is always hidden with a function default", () => {
    const countryCode = patientFormFields.find((f) => f.key === "country_code")!;
    expect(countryCode.hidden).toBe(true);
    expect(typeof countryCode.default).toBe("function");
  });

  it("territory_id is an autocomplete with an async loader", () => {
    const territory = patientFormFields.find((f) => f.key === "territory_id")!;
    expect(territory.type).toBe("autocomplete");
    expect(typeof territory.options).toBe("function");
  });

  describe("practitioner_id options", () => {
    const load = patientFormFields.find((f) => f.key === "practitioner_id")!.options as (
      form: Record<string, unknown>,
    ) => Promise<FormFieldOption[]>;

    beforeEach(() => {
      apiFetch.mockReset();
      setActivePinia(createPinia());
      useConfigStore().options = {
        regions: [],
        specialties: [{ key: "dentist", value: "Odontólogo", locale: "mx", sort_order: 0, locked: false, custom: false }],
        organization_types: [],
      };
    });

    it("subtitles each doctor with translated specialty · clinic, so similar names can be told apart", async () => {
      apiFetch.mockResolvedValueOnce(jsonResponse(true, { items: [
        { id: "d1", name: "Dra. Laura Cuicas", primary_specialty: "dentist", institution: "Clínica Dental Sur" },
        { id: "d2", name: "Dr. Anna Kowalska", primary_specialty: "", institution: "" },
        { id: "d3", name: "Dr. Andrzej Testerski", primary_specialty: "ent", institution: "" },
      ] }));

      const options = await load({});

      expect(options).toEqual([
        { title: "Dra. Laura Cuicas", value: "d1", subtitle: "Odontólogo · Clínica Dental Sur" },
        { title: "Dr. Anna Kowalska", value: "d2" },
        { title: "Dr. Andrzej Testerski", value: "d3", subtitle: "ent" },
      ]);
    });

    it("the saved doctor fetched on its own (outside the bulk page) gets the same subtitle", async () => {
      apiFetch
        .mockResolvedValueOnce(jsonResponse(true, { items: [] }))
        .mockResolvedValueOnce(jsonResponse(true, { id: "old", name: "Dr. Old", primary_specialty: "dentist", institution: "HCO" }));

      const options = await load({ practitioner_id: "old" });

      expect(options).toEqual([{ title: "Dr. Old", value: "old", subtitle: "Odontólogo · HCO" }]);
    });
  });
});
