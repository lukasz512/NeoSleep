/** Email language from the patient's own settings: Polish, Mexican Spanish, else by region, else English. */
export function patientEmailLocale(language: string | null, region: string | null): string {
  const lang = (language ?? "").toLowerCase();
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("es") || lang === "mx") return "mx";
  const reg = (region ?? "").toUpperCase();
  if (reg === "PL") return "pl";
  if (reg === "MX") return "mx";
  return "en";
}
