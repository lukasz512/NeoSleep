import { intlLocale } from "@i18n/language-options";

/** The plural categories the list count has keys for (app.list.count.<category>). */
export type CountCategory = "one" | "few" | "many" | "other";

/** Lists that name what they count ("8 patients") instead of "8 records". */
export type ListCountNoun = "patients" | "doctors" | "clinics" | "leads" | "users" | "territories" | "studies" | "devices";

/**
 * NEO-152: the i18n key for a list's count under its title ("1 patient",
 * "3 pacjentów", "5 badań"). Intl.PluralRules picks the category for the
 * app's locale (Polish needs one/few/many, English and Spanish one/other);
 * a category a language has no key for falls back to "other". Without a noun
 * the generic "N records" keys are used.
 */
export function listCountKey(count: number, locale: string, noun?: ListCountNoun): string {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  const known: CountCategory[] = ["one", "few", "many", "other"];
  const prefix = noun ? `app.list.count.${noun}` : "app.list.count";
  return `${prefix}.${known.includes(category as CountCategory) ? category : "other"}`;
}
