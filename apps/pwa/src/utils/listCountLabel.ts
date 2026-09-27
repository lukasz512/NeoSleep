import { intlLocale } from "@i18n/language-options";

/** The plural categories the list count has keys for (app.list.count.<category>). */
export type CountCategory = "one" | "few" | "many" | "other";

/**
 * NEO-152: the i18n key for a list's record count under its title ("1 record",
 * "3 rekordy", "5 rekordów"). Intl.PluralRules picks the category for the
 * app's locale (Polish needs one/few/many, English and Spanish one/other);
 * a category a language has no key for falls back to "other".
 */
export function listCountKey(count: number, locale: string): string {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  const known: CountCategory[] = ["one", "few", "many", "other"];
  return `app.list.count.${known.includes(category as CountCategory) ? category : "other"}`;
}
