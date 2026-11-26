import { SALUTATION_PREFIXES } from "../config/forms/identityFields";

const NAME_START_RE = /^[a-zA-ZÀ-žżźćńółęąśŻŹĆŃÓŁĘĄŚ]/;
const SALUTATION_SET = new Set(SALUTATION_PREFIXES.map((p) => p.toLowerCase()));

/**
 * First+last initial ("Tomasz Kowalski" -> "TK"), first two letters of a
 * single word, or "?" when nothing parses as a name. A leading salutation
 * ("Dra. Lorena González" — see identityFields.ts's `title` field) is
 * dropped first, so it never displaces the actual first name from the
 * avatar (e.g. "DP" from "Dra. ... Pimentel" instead of "LG").
 */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((w) => NAME_START_RE.test(w) && !SALUTATION_SET.has(w.toLowerCase()));
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

/**
 * First letter of `firstName` + first letter of `lastName`, taken directly
 * from the identity record's own fields rather than guessed by splitting a
 * display string — the only reliable way to handle a multi-word given name
 * or surname (see AppAvatar.vue's `firstName`/`lastName` props).
 */
export function getInitialsFromParts(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!first && !last) return "?";
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
}
