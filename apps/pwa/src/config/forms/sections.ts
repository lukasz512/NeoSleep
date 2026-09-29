import type { FormFieldDef, FormSectionId } from "../../types/formField";

/**
 * Tags a run of fields with one form section (NEO-92) — keeps the per-entity
 * configs readable: `...inSection("territory", regionField, territoryField)`.
 * Returns copies, so shared field factories (identityFields) stay untouched.
 */
export function inSection(section: FormSectionId, ...fields: FormFieldDef[]): FormFieldDef[] {
  return fields.map((f) => ({ ...f, section }));
}
