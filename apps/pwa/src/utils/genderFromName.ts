/**
 * Infer gender from name prefix/title for subtle icon display.
 * Mr, Dr → male; Ms, Mrs, Dra → female.
 */
export type Gender = "male" | "female";

const MALE_PREFIXES = ["mr", "dr"];
const FEMALE_PREFIXES = ["ms", "mrs", "dra"];

export function getGenderFromName(name: string | null | undefined): Gender | null {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const firstWord = trimmed.split(/\s+/)[0]?.replace(/\.$/, "").toLowerCase() ?? "";
  if (MALE_PREFIXES.includes(firstWord)) return "male";
  if (FEMALE_PREFIXES.includes(firstWord)) return "female";
  return null;
}
