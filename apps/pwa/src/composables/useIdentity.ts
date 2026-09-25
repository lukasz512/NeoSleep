import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import { useSpecialtyLabel } from "./useSpecialtyLabel";
import { ageFromDateOfBirth } from "../utils/patientDemographics";
import { hcoTypeLabel } from "../utils/hcoLabels";

/** The quiet line under a large identity's name: values joined with " · ", overflow behind "+N". */
export interface IdentityDetailSet {
  details: string[];
  more: string[];
}

interface PatientLike {
  gender?: string | null;
  date_of_birth?: string | null;
}

interface DoctorLike {
  primary_specialty?: string | null;
  specialty?: string | null;
  specialties?: string[] | null;
  institution?: string | null;
}

interface OrgLike {
  type?: string | null;
  city?: string | null;
}

const GENDER_LABEL_KEYS: Record<string, string> = {
  female: "app.patients.form.genderFemale",
  male: "app.patients.form.genderMale",
  other: "app.patients.form.genderOther",
  prefer_not_to_say: "app.patients.form.genderPreferNot",
};

/**
 * What goes under a name in the shared identity (NEO-57) — the one place
 * that decides it, so a patient, a doctor or a clinic reads the same on
 * every screen. Plain values, no labels:
 * - patient: "F · 47 y" (+ "b. 3/12/1979" on mobile cards; the header spells
 *   the sex out: "Female · 47 y · b. 3/12/1979")
 * - doctor: the first specialty, the rest behind "+N" (+ clinic in the header)
 * - organization: its type (+ city in the header)
 * - user: role
 */
export function useIdentity() {
  const { t, locale } = useI18n();
  const specialtyLabel = useSpecialtyLabel();

  /** YYYY-MM-DD as a local calendar date in the app locale — never shifted by a time zone. */
  function formatDob(dob?: string | null): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? "");
    if (!m) return "";
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(intlLocale(locale.value));
  }

  function patientDetails(p: PatientLike, opts: { withDob?: boolean; long?: boolean } = {}): IdentityDetailSet {
    const details: string[] = [];
    const genderKey = p.gender ? GENDER_LABEL_KEYS[p.gender] : undefined;
    if (opts.long && genderKey) details.push(t(genderKey));
    else if (p.gender === "female" || p.gender === "male") details.push(t(`app.patients.sexShort.${p.gender}`));
    const age = ageFromDateOfBirth(p.date_of_birth);
    if (age != null) details.push(t("app.patients.ageShort", { age }));
    if ((opts.withDob || opts.long) && p.date_of_birth) details.push(t("app.patients.dobShort", { date: formatDob(p.date_of_birth) }));
    return { details, more: [] };
  }

  /** First specialty shown; any others (from the full list) go behind "+N". */
  function specialtySet(primary?: string | null, all?: string[] | null): IdentityDetailSet {
    const first = primary || all?.[0] || "";
    const rest = (all ?? []).filter((s) => s && s !== first);
    return { details: first ? [specialtyLabel(first)] : [], more: rest.map((s) => specialtyLabel(s)) };
  }

  function doctorDetails(d: DoctorLike, opts: { withClinic?: boolean } = {}): IdentityDetailSet {
    const set = specialtySet(d.primary_specialty || d.specialty, d.specialties);
    if (opts.withClinic && d.institution) set.details.push(d.institution);
    return set;
  }

  function orgDetails(o: OrgLike, opts: { withCity?: boolean } = {}): IdentityDetailSet {
    const details = o.type ? [hcoTypeLabel(t, o.type)] : [];
    if (opts.withCity && o.city) details.push(o.city);
    return { details, more: [] };
  }

  function userDetails(role?: string | null): IdentityDetailSet {
    return { details: role ? [t(`user.users.role.${role}`)] : [], more: [] };
  }

  return { patientDetails, specialtySet, doctorDetails, orgDetails, userDetails, formatDob };
}
