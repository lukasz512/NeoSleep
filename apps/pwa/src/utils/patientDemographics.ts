/**
 * Patient demographics helpers (NEO-57). The tags/fields built from them
 * live in composables/useIdentity.ts.
 */

export interface PatientDemographics {
  gender?: string | null;
  date_of_birth?: string | null;
}

/** Full years between a YYYY-MM-DD birth date and `today`; null when unknown or invalid. */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? "");
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
