/** Normalize a scalar-or-array filter value to a string array. */
export function toArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value?.trim() ? [value.trim()] : [];
}

/** Trim a string; return null if empty. */
export function trimOrNull(value: string | undefined | null): string | null {
  return value?.trim() || null;
}

/** Trim a string; return empty string if empty. */
export function trimOrEmpty(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

/**
 * Identity emails are stored trimmed and lowercased, everywhere (CORE-173).
 * identities' unique email index is case-sensitive, and the user/practitioner
 * upserts link one person's two rows by ON CONFLICT (email) — so a
 * "Lorena@x.mx" practitioner and a "lorena@x.mx" login used to end up on two
 * identities, and the doctor saw nothing.
 */
export function normalizeEmail(value: string | undefined | null): string | null {
  return value?.trim().toLowerCase() || null;
}
