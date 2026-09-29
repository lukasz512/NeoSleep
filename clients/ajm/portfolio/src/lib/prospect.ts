/**
 * Personal pitch links (CORE-59, Łukasz 2026-09-29): alfredjan.com/corporativo?para=mendel greets the
 * prospect by name ("Hola Mendel", written by the pen in the entry and on the hero), and when we have
 * their logo the AJ sketch ends as "AJ × <their logo>". Any name works; known clients add the logo.
 * Nothing is stored or sent: the name only lives in the link.
 */
import { CLIENTS } from "../content/cases";

export interface Prospect {
  name: string;
  logo?: string;
  height?: number;
}

/** slugs that map to a client whose one-colour logo we already have (logos/, encode-logos.sh) */
const KNOWN: Record<string, { name: string; logo: string; height: number }> = Object.fromEntries(
  CLIENTS.flatMap((c) => {
    const entry = { name: c.anchor === "planeta" ? "Grupo Planeta" : c.name.split(" ")[0]!, logo: c.logo, height: c.height };
    return [c.anchor, c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")].map((k) => [k, entry]);
  }),
);
KNOWN["grupo-planeta"] = KNOWN.planeta!;
KNOWN.universal = { ...KNOWN.universal!, name: "Universal" };

const MAX = 32;

/** "coca-cola" → "Coca Cola"; names typed with capitals ("BBVA") are kept as written */
function tidy(raw: string): string {
  const clean = raw
    .replace(/[-_+]+/g, " ")
    .replace(/[^\p{L}\p{N} &.'’]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX)
    .trim();
  if (!clean) return "";
  if (clean !== clean.toLowerCase()) return clean;
  return clean.replace(/\p{L}+/gu, (w) => w[0]!.toUpperCase() + w.slice(1));
}

export function prospectFrom(search: string): Prospect | null {
  const params = new URLSearchParams(search);
  const raw = params.get("para") ?? params.get("for") ?? "";
  const known = KNOWN[raw.trim().toLowerCase()];
  if (known) return { ...known };
  const name = tidy(raw);
  return name ? { name } : null;
}
