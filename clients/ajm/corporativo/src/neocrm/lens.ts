/**
 * The neoCRM page's "para" link, version 1 (CORE-215, Łukasz 2026-11-16): besides the greeting
 * (lib/prospect.ts), the link can say who is reading (?rol=it) and which sector they work in
 * (?sector=clinicas). The role only changes the order of the sections, never their content, and the
 * sector only changes the hero and which use case is listed first. Anything unknown means the
 * normal page. Nothing is stored or sent: it all lives in the link.
 */
export const ROLES = ["direccion", "it", "operaciones"] as const;
export type Role = (typeof ROLES)[number];

export const SECTORS = ["clinicas", "distribucion", "equipos"] as const;
export type Sector = (typeof SECTORS)[number];

/** Sections between the hero (always first) and the demo request (always last), in the normal order. */
export const SECTIONS = ["who", "product", "brand", "security", "access", "privacy", "onboarding", "roadmap", "faq"] as const;
export type SectionId = (typeof SECTIONS)[number];

const ORDER: Record<Role, readonly SectionId[]> = {
  direccion: ["who", "onboarding", "product", "brand", "security", "access", "privacy", "roadmap", "faq"],
  it: ["security", "privacy", "access", "roadmap", "product", "brand", "onboarding", "who", "faq"],
  operaciones: ["product", "who", "onboarding", "brand", "access", "security", "privacy", "roadmap", "faq"],
};

/** English links work too: ?role=management */
const ROLE_ALIASES: Record<string, Role> = { management: "direccion", security: "it", operations: "operaciones" };
const SECTOR_ALIASES: Record<string, Sector> = { clinics: "clinicas", distribution: "distribucion", teams: "equipos" };

export interface Lens {
  role: Role | null;
  sector: Sector | null;
}

function pick<T extends string>(raw: string | null, values: readonly T[], aliases: Record<string, T>): T | null {
  const key = (raw ?? "").trim().toLowerCase();
  return values.find((v) => v === key) ?? aliases[key] ?? null;
}

export function lensFrom(search: string): Lens {
  const params = new URLSearchParams(search);
  return {
    role: pick(params.get("rol") ?? params.get("role"), ROLES, ROLE_ALIASES),
    sector: pick(params.get("sector"), SECTORS, SECTOR_ALIASES),
  };
}

export function sectionOrder(role: Role | null): readonly SectionId[] {
  return role ? ORDER[role] : SECTIONS;
}

/** The same link with the lens changed, keeping the rest of the query (?para=, ?lang=). */
export function lensQuery(search: string, lens: Lens): string {
  const params = new URLSearchParams(search);
  params.delete("role");
  for (const [key, value] of [["rol", lens.role], ["sector", lens.sector]] as const) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Personal versions of the page stay out of search engines; only the plain page is indexed. */
export function isPersonalLink(search: string): boolean {
  const params = new URLSearchParams(search);
  return ["para", "for", "rol", "role", "sector"].some((k) => params.has(k));
}
