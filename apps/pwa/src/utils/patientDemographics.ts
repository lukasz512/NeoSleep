/**
 * Patient "sex · age" line shown under the patient's name in lists (NEO-57),
 * e.g. "F · 47 y" / "K · 47 l." / "F · 47 años". A plain function with the
 * translator injected, same convention as utils/mobileCardMeta.ts, so it's
 * unit-testable without the vue-i18n harness.
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

/**
 * Only female/male get a letter — "other" and "prefer_not_to_say" show just
 * the age, so the line never labels a patient with something they didn't
 * choose. Returns "" when there is nothing to show.
 */
export function patientSexAge(
  patient: PatientDemographics,
  translate: (key: string, params?: Record<string, unknown>) => string,
  today?: Date,
): string {
  const sex =
    patient.gender === "female" || patient.gender === "male"
      ? translate(`app.patients.sexShort.${patient.gender}`)
      : "";
  const age = ageFromDateOfBirth(patient.date_of_birth, today);
  const ageText = age != null ? translate("app.patients.ageShort", { age }) : "";
  return [sex, ageText].filter(Boolean).join(" · ");
}
