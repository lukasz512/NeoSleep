/**
 * Accent-insensitive, wildcard-safe substring matching (CORE-292).
 * The SQL expression mirrors the index expressions of migration 071
 * (extensions.f_unaccent(lower(...))) so the trigram indexes stay usable.
 */

/** Builds the LIKE pattern: NFC, lowercased, `\`, `%` and `_` escaped, wrapped in `%…%`. */
export function likeTerm(raw: string): string {
  const escaped = raw.trim().normalize("NFC").toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/** `expr` must be a trusted SQL fragment (a column expression), never user input. */
export function unaccentLike(expr: string, paramIndex: number): string {
  return `extensions.f_unaccent(LOWER(${expr})) LIKE extensions.f_unaccent($${paramIndex}) ESCAPE '\\'`;
}
