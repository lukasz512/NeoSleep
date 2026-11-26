/**
 * Pure data helpers for the public find-a-specialist page (NEO-79) — the
 * response shape of GET /api/v1/public/specialists, client-side search,
 * and the card's call / directions / website links. No Vue, no Maps SDK, so
 * every rule here is unit-tested on its own (specialists.spec.ts).
 */

export interface SpecialistPractitioner {
  id: string;
  name: string;
  specialties: string[];
}

export interface Specialist {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  phone: string | null;
  website: string | null;
  google_link: string | null;
  specialties: string[];
  latitude: number;
  longitude: number;
  practitioners: SpecialistPractitioner[];
}

/**
 * Specialty codes the website has a translated label for
 * (`website.findSpecialist.specialty.<code>` in packages/i18n). Same codes
 * as the platform.lookups `specialty` vocabulary. A code outside this list
 * (e.g. `other`, or a tenant-specific one) simply shows no label chip.
 */
export const LABELLED_SPECIALTIES = [
  "dentist",
  "ent",
  "pulmonologist",
  "gp",
  "neurologist",
  "psychiatrist",
  "cardiologist",
  "internist",
] as const;

export type LabelledSpecialty = (typeof LABELLED_SPECIALTIES)[number];

export function isLabelledSpecialty(code: string): code is LabelledSpecialty {
  return (LABELLED_SPECIALTIES as readonly string[]).includes(code);
}

export function specialtyLabelKey(code: LabelledSpecialty): string {
  return `website.findSpecialist.specialty.${code}`;
}

/** Every specialty on the clinic or on any of its doctors, labelled ones only, de-duplicated, in vocabulary order. */
export function specialtiesOf(specialist: Specialist): LabelledSpecialty[] {
  const all = new Set<string>([...specialist.specialties, ...specialist.practitioners.flatMap((p) => p.specialties)]);
  return LABELLED_SPECIALTIES.filter((code) => all.has(code));
}

/** Case- and accent-insensitive form used for matching ("México" ~ "mexico"). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Client-side search over the loaded list (the page loads at most 100
 * clinics once, so typing never spends the endpoint's 60-per-15-min rate
 * limit). Matches clinic name, address, city, state, doctor names, the
 * specialty codes, and the specialty labels passed in — the caller passes
 * the labels in every site language, so "dentista", "dentysta" and
 * "dentist" all find a dentist whatever language the page is in.
 * Every word of the query must match somewhere ("dentista coyoacan").
 */
export function matchesSearch(
  specialist: Specialist,
  query: string,
  labelsFor: (code: LabelledSpecialty) => string[],
): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const codes = [...new Set([...specialist.specialties, ...specialist.practitioners.flatMap((p) => p.specialties)])];
  const haystack = normalizeForSearch(
    [
      specialist.name,
      specialist.address_line1,
      specialist.city,
      specialist.state,
      ...specialist.practitioners.map((p) => p.name),
      ...codes,
      ...codes.filter(isLabelledSpecialty).flatMap((code) => labelsFor(code)),
    ]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" \u0000 "),
  );
  return words.every((word) => haystack.includes(word));
}

/** Filter by the chosen specialty chip; `null` = all. */
export function matchesSpecialty(specialist: Specialist, code: LabelledSpecialty | null): boolean {
  return code === null || specialtiesOf(specialist).includes(code);
}

/** The labelled specialties present in the data, in vocabulary order — the chips. */
export function availableSpecialties(specialists: Specialist[]): LabelledSpecialty[] {
  const present = new Set(specialists.flatMap((s) => specialtiesOf(s)));
  return LABELLED_SPECIALTIES.filter((code) => present.has(code));
}

/**
 * `tel:` href from a phone number as it is stored (free text such as
 * "+52 55 5555 0101" or "(55) 5555-0101"): keeps a leading "+" and the
 * digits only. Null when there are too few digits to be dialable.
 */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** Google Maps directions to the clinic: its own Google link when set, else a directions URL to the pin. */
export function directionsHref(specialist: Specialist): string {
  const link = specialist.google_link?.trim();
  if (link) return /^https?:\/\//i.test(link) ? link : `https://${link}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${specialist.latitude},${specialist.longitude}`;
}

/** Website as an absolute http(s) URL (the CRM form accepts "example.com"), or null. */
export function websiteHref(website: string | null): string | null {
  const value = website?.trim();
  if (!value) return null;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    // benign: a malformed stored URL just hides the "Website" action.
    return null;
  }
}

/** "Street, City, State" with empty parts dropped. */
export function addressLine(specialist: Specialist): string {
  return [specialist.address_line1, specialist.city, specialist.state].filter(Boolean).join(", ");
}
