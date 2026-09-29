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
 * have one. This is the one place that rule lives now — including for names
 * built inside SQL (displayNameSql below), so a JOINed "related person" name
 * (a treatment plan's doctor, a note's author, ...) follows the same rule as
 * that person's own list row (NEO-13).
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

/**
 * Same rule for a LEFT JOINed, possibly-absent person (a treatment plan's
 * doctor, a note's author, ...): null when there's no name at all, so the
 * caller renders its own "—" instead of a lone salutation.
 */
export function formatOptionalDisplayName(person: {
  salutation?: string | null;
  first_name: string | null;
  last_name: string | null;
}): string | null {
  if (!person.first_name?.trim() && !person.last_name?.trim()) return null;
  return formatDisplayName({
    salutation: person.salutation,
    first_name: person.first_name?.trim() ?? "",
    last_name: person.last_name?.trim() ?? "",
  });
}

/**
 * SQL-expression twin of formatDisplayName, for names that have to be built
 * inside a query (json_agg, a computed column several callers read raw).
 * `alias` is the identities table alias — a code constant at every call
 * site, never user input (still validated, fail-loud). The IN-list is
 * generated from DISPLAYED_SALUTATIONS, so the allow-list stays single-sourced.
 */
export function displayNameSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`displayNameSql: invalid alias "${alias}"`);
  const allowList = [...DISPLAYED_SALUTATIONS].map((s) => `'${s.replace(/'/g, "''")}'`).join(", ");
  return `TRIM(CONCAT_WS(' ', CASE WHEN ${alias}.title IN (${allowList}) THEN ${alias}.title END, NULLIF(TRIM(${alias}.first_name), ''), NULLIF(TRIM(${alias}.last_name), '')))`;
}
