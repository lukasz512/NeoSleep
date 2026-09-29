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
/**
 * App locale id → BCP 47 tag for Intl APIs (dates, numbers). `mx` is an
 * internal short key, not a valid BCP 47 language tag, so Intl would silently
 * fall back to the runtime default without this mapping.
 */
export declare function intlLocale(id: string): string;
