/**
 * Shared "display name" rule for identities (patient/practitioner/lead/user) —
 * a salutation/prefix is only shown when it's an academic/professional title
 * (Dr., Dra., Prof.), not a plain honorific (Lic., Mgr., Sr., Sra.). Confirmed
 * allow-list (explicit product decision, not all 7 PREFIX_OPTIONS values in
 * apps/pwa/src/config/forms/identityFields.ts qualify).
 *
 * Previously each of db/patient.ts, queries/practitioner.ts and db/lead.ts
 * built this string independently — patient.ts/practitioner.ts included
 * salutation unconditionally, lead.ts dropped it entirely even though leads
 * have one. This is the one place that rule lives now.
 */
const DISPLAYED_SALUTATIONS = new Set(["Dr.", "Dra.", "Prof."]);

export function formatDisplayName(person: {
  salutation?: string | null;
  first_name: string;
  last_name: string;
}): string {
  const salutation = person.salutation && DISPLAYED_SALUTATIONS.has(person.salutation) ? person.salutation : null;
  return [salutation, person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}
