import { ValidationError } from "../errors.js";

/**
 * The ONE country -> language mapping (CORE-261). Used to default `identities.language` when an
 * identity is created or backfilled, and as the fallback for rows that still hold the default 'en'.
 * Active markets: PL, MX. Any other country has no templates yet and falls back to English.
 */
export function localeForCountry(country: string | null | undefined): string {
  const normalized = (country ?? "").trim().toUpperCase();
  if (normalized === "PL") return "pl";
  if (normalized === "MX") return "mx";
  return "en";
}

/** Languages an identity can be set to (internal ids; mx = es-MX). All three have mail and notification templates. */
export const SUPPORTED_LANGUAGES = ["en", "pl", "mx"] as const;

export function hasTemplates(language: string): boolean {
  return language === "pl" || language === "mx" || language === "en";
}

/**
 * Language for mail AND notifications: the identity's explicit pl/es/mx language wins; a plain 'en'
 * (the column default) yields to the country; otherwise English.
 */
export function patientEmailLocale(language: string | null, region: string | null): string {
  const lang = (language ?? "").toLowerCase();
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("es") || lang === "mx") return "mx";
  return localeForCountry(region);
}

/**
 * Language for ONE manual send (CORE-268). The sender may override the recipient's language; the
 * override is used as given, so the region is dropped (otherwise an explicit `en` for a PL/MX
 * recipient would be re-mapped to the country's language). No override: the recipient's language.
 */
export function resolveSendLanguage(
  override: unknown,
  language: string | null,
  region: string | null,
): { language: string; region: string | null } {
  if (override === undefined || override === null || override === "") {
    return { language: patientEmailLocale(language, region), region };
  }
  if (typeof override !== "string" || !(SUPPORTED_LANGUAGES as readonly string[]).includes(override)) {
    throw new ValidationError(`language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`);
  }
  return { language: override, region: null };
}
