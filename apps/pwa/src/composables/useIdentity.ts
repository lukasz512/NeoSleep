import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import { useSpecialtyLabel } from "./useSpecialtyLabel";
import { ageFromDateOfBirth } from "../utils/patientDemographics";
import { hcoTypeLabel } from "../utils/hcoLabels";

/** One labelled field of a large identity header ("SEX · Female"). */
export interface IdentityField {
  label: string;
  value: string;
  /** Extra values shown as a "+N" tag with a tooltip (a doctor's other specialties). */
  more?: string[];
}

/** Tags + overflow for a large identity in a list row or card. */
export interface IdentityTagSet {
  tags: string[];
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
 * What goes under a name in the shared identity (NEO-57 "wristband + EHR"):
 * `*Tags` for the large identity in list rows / mobile cards, `*Fields` for
 * the labelled detail-view header. One place decides it, so a patient, a
 * doctor or a clinic looks the same on every screen:
 * - patient: sex · age (+ date of birth on cards and in the header)
 * - doctor: the first specialty, the rest in a "+N" tooltip
 * - organization: its type
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

  function patientTags(p: PatientLike, opts: { withDob?: boolean } = {}): IdentityTagSet {
    const tags: string[] = [];
    if (p.gender === "female" || p.gender === "male") tags.push(t(`app.patients.sexShort.${p.gender}`));
    const age = ageFromDateOfBirth(p.date_of_birth);
    if (age != null) tags.push(t("app.patients.ageShort", { age }));
    if (opts.withDob && p.date_of_birth) tags.push(t("app.patients.dobShort", { date: formatDob(p.date_of_birth) }));
    return { tags, more: [] };
  }

  function patientFields(p: PatientLike): IdentityField[] {
    const age = ageFromDateOfBirth(p.date_of_birth);
    const genderKey = p.gender ? GENDER_LABEL_KEYS[p.gender] : undefined;
    return [
      { label: t("app.identity.field.sex"), value: genderKey ? t(genderKey) : "" },
      { label: t("app.identity.field.age"), value: age != null ? String(age) : "" },
      { label: t("app.identity.field.dateOfBirth"), value: formatDob(p.date_of_birth) },
    ];
  }

  /** First specialty as the tag; any others (from the full list) go to "+N". */
  function specialtySet(primary?: string | null, all?: string[] | null): IdentityTagSet {
    const first = primary || all?.[0] || "";
    const rest = (all ?? []).filter((s) => s && s !== first);
    return { tags: first ? [specialtyLabel(first)] : [], more: rest.map((s) => specialtyLabel(s)) };
  }

  function doctorTags(d: DoctorLike): IdentityTagSet {
    return specialtySet(d.primary_specialty || d.specialty, d.specialties);
  }

  function doctorFields(d: DoctorLike): IdentityField[] {
    const s = doctorTags(d);
    return [
      { label: t("app.identity.field.specialty"), value: s.tags[0] ?? "", more: s.more },
      { label: t("app.identity.field.clinic"), value: d.institution ?? "" },
    ];
  }

  function orgTags(o: OrgLike): IdentityTagSet {
    return { tags: o.type ? [hcoTypeLabel(t, o.type)] : [], more: [] };
  }

  function orgFields(o: OrgLike): IdentityField[] {
    return [
      { label: t("app.identity.field.type"), value: o.type ? hcoTypeLabel(t, o.type) : "" },
      { label: t("app.identity.field.city"), value: o.city ?? "" },
    ];
  }

  function userTags(role?: string | null): IdentityTagSet {
    return { tags: role ? [t(`user.users.role.${role}`)] : [], more: [] };
  }

  return { patientTags, patientFields, specialtySet, doctorTags, doctorFields, orgTags, orgFields, userTags, formatDob };
}
