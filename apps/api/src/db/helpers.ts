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
