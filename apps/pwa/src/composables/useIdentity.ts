import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import { useSpecialtyLabel } from "./useSpecialtyLabel";
import { ageFromDateOfBirth } from "../utils/patientDemographics";
import { hcoTypeLabel } from "../utils/hcoLabels";
import type { AppAvatarEntityType } from "../types/formField";

/** The quiet line under a large identity's name: values joined with " · ", overflow behind "+N". */
export interface IdentityDetailSet {
  details: string[];
  more: string[];
}

/** One labelled fact for the form folder's ficha (NEO-118): "Sexo — Masculino"; `more` collapses behind "+N". */
export interface IdentityFact {
  key: string;
  label: string;
  value: string;
  more?: string[];
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

  /**
   * The record's key facts, one per line with a label (NEO-118): the
   * form folder's spine lists them as a ficha, so no fact ever wraps into the
   * next one. Empty values are left out, unless `placeholders` is set: then
   * they come back with an empty value, so a create form can draw the whole
   * ficha as a still skeleton that fills in as the user types (NEO-128).
   */
  function factsFor(
    entityType: AppAvatarEntityType,
    record: Record<string, unknown>,
    { placeholders = false }: { placeholders?: boolean } = {},
  ): IdentityFact[] {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const facts: IdentityFact[] = [];
    const add = (key: string, value: string | null | undefined, more?: string[]) => {
      if (!value && !placeholders) return;
      facts.push({ key, label: t(`app.formRenderer.fact.${key}`), value: value ?? "", ...(more?.length ? { more } : {}) });
    };
    switch (entityType) {
      case "patient": {
        const gender = str(record.gender);
        const dob = str(record.date_of_birth);
        const age = ageFromDateOfBirth(dob);
        add("sex", gender && GENDER_LABEL_KEYS[gender] ? t(GENDER_LABEL_KEYS[gender]) : null);
        add("age", age != null ? t("app.patients.ageShort", { age }) : null);
        add("born", formatDob(dob));
        break;
      }
      case "hcp":
      case "lead": {
        const set = specialtySet(
          str(record.primary_specialty),
          Array.isArray(record.specialties) ? record.specialties.map(String) : null,
        );
        add("specialty", set.details[0], set.more);
        add("clinic", str(record.institution));
        break;
      }
      case "hco": {
        const type = str(record.type);
        add("type", type ? hcoTypeLabel(t, type) : null);
        add("city", str(record.city));
        break;
      }
      case "user": {
        const role = str(record.role);
        add("role", role ? t(`user.users.role.${role}`) : null);
        break;
      }
    }
    return facts;
  }

  return { patientDetails, specialtySet, doctorDetails, orgDetails, userDetails, factsFor, formatDob };
}
