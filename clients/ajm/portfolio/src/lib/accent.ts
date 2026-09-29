/**
 * Headline markup in the locale files, so copy and emphasis stay together in ES and EN:
 *   [word]    → the headline's one Bodoni italic word (T1 = A)
 *   ~phrase~  → the partner's key phrase with the sand marker (T2: once per partner)
 * They can nest: "construida ~a través del [tiempo.]~". (Not {…}: vue-i18n reads braces as
 * placeholders.)
 */
export interface Segment {
  text: string;
  acc: boolean;
  mk: boolean;
}

export function parseAccent(source: string): Segment[] {
  const out: Segment[] = [];
  let acc = false;
  let mk = false;
  let buf = "";
  const flush = () => {
    if (buf) out.push({ text: buf, acc, mk });
    buf = "";
  };
  for (const ch of source) {
    if (ch === "[" || ch === "]" || ch === "~") {
      flush();
      if (ch === "[") acc = true;
      else if (ch === "]") acc = false;
      else mk = !mk;
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

export interface Group {
  mk: boolean;
  parts: Segment[];
}

/** Consecutive segments that share the marker, so a marked phrase renders as one span. */
export function groupAccent(source: string): Group[] {
  const groups: Group[] = [];
  for (const s of parseAccent(source)) {
    const last = groups[groups.length - 1];
    if (last && last.mk === s.mk) last.parts.push(s);
    else groups.push({ mk: s.mk, parts: [s] });
  }
  return groups;
}

/** Number of marker strokes in style.css (.mk--0 … .mk--3). */
export const MARKER_VARIANTS = 4;

/**
 * Which hand-drawn stroke a phrase gets: fixed per text (same stroke on every visit and in both
 * themes), but different between neighbouring headlines so no two look stamped (round 7).
 */
export function markerVariant(source: string): number {
  let h = 7;
  for (const ch of plainAccent(source)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % MARKER_VARIANTS;
}

/** The plain sentence, for document titles, aria labels and anywhere markup can't go. */
export function plainAccent(source: string): string {
  return source.replace(/[[\]~]/g, "");
}
