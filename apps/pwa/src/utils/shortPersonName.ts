/**
 * List/tile name (NEO-57): salutation + first given name + first surname —
 * "Dra. Lorena Alejandra González Pimentel" -> "Dra. Lorena González".
 * Detail headers keep the full name; only rows and cards shorten it.
 *
 * `label` is the API's already-formatted display name (the salutation rule
 * lives server-side in apps/api/src/utils/personName.ts), so the salutation
 * is taken from whatever precedes the first name in it rather than
 * re-deciding here which titles are shown. Without name parts the label is
 * returned unchanged — a multi-word name can't be split reliably from the
 * display string alone.
 */
export function shortPersonName(
  label: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const full = label?.trim() ?? "";
  const first = firstName?.trim().split(/\s+/)[0] ?? "";
  const last = lastName?.trim().split(/\s+/)[0] ?? "";
  if (!first && !last) return full;
  const firstAt = first ? full.indexOf(firstName!.trim()) : -1;
  const salutation = firstAt > 0 ? full.slice(0, firstAt).trim() : "";
  return [salutation, first, last].filter(Boolean).join(" ");
}
