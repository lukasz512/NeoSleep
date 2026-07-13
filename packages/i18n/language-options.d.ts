/**
 * Shared language options for all apps (rep-app, website, etc.).
 * Single source of truth: id, labelKey (i18n), nativeLabel (for selector display), flag emoji.
 */
export type LocaleId = "en" | "pl" | "mx";
export declare const LANGUAGE_OPTIONS: {
    id: LocaleId;
    labelKey: string;
    nativeLabel: string;
    flag: string;
}[];
