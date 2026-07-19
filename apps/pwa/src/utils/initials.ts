const NAME_START_RE = /^[a-zA-ZÀ-žżźćńółęąśŻŹĆŃÓŁĘĄŚ]/;

/**
 * First+last initial ("Tomasz Kowalski" -> "TK"), first two letters of a
 * single word, or "?" when nothing parses as a name.
 */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((w) => NAME_START_RE.test(w));
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}
