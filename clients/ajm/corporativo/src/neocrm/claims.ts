/**
 * Claims the neoCRM page must not make (CORE-215 claims ledger, docs/stories/core-215-…): nothing here
 * is true of the product today. The "what we are working on" section may name them as future work;
 * everywhere else they fail the copy test.
 */
export const FORBIDDEN_CLAIMS: readonly RegExp[] = [
  /ISO\s*27001/i,
  /SOC\s*2/i,
  /HIPAA/i,
  /WCAG/i,
  /certific/i,
  /\b2FA\b|two-factor|two-step|doble factor|dos pasos/i,
  /hosted in (the )?(EU|Europe)|alojad[oa]s? en (la )?(UE|Uni[oó]n Europea|Europa|Espa[nñ]a)/i,
  /row-level|\bRLS\b/i,
  /24\s*\/\s*7/,
  /tamper|inmutable|inalterable/i,
  /(GDPR|RGPD)[- ]compliant|cumpl\w* (con )?(el )?(RGPD|GDPR)/i,
];

/** The one section allowed to name future work. */
export const ROADMAP_KEY = "roadmap";

type Copy = string | readonly Copy[] | { readonly [key: string]: Copy };

/** Every string of a locale file with its key path, e.g. ["sections.security.items.0.body", "…"]. */
export function flattenCopy(copy: Copy, path = ""): [string, string][] {
  if (typeof copy === "string") return [[path, copy]];
  return Object.entries(copy).flatMap(([key, value]) => flattenCopy(value as Copy, path ? `${path}.${key}` : key));
}

export function forbiddenClaims(copy: Copy): string[] {
  return flattenCopy(copy)
    .filter(([path]) => !path.split(".").includes(ROADMAP_KEY))
    .filter(([, text]) => FORBIDDEN_CLAIMS.some((claim) => claim.test(text)))
    .map(([path]) => path);
}
