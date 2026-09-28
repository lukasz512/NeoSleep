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

/** The plain sentence, for document titles, aria labels and anywhere markup can't go. */
export function plainAccent(source: string): string {
  return source.replace(/[[\]~]/g, "");
}
