/** BFF base URL for auth and API. Set VITE_BFF_URL in .env for production. */
export declare function getBffUrl(): string;
export declare const REP_STORAGE_KEYS: {
    /** Single key for all rep-app settings (theme, locale, sidebar, filters). Later can sync to backend. */
    readonly settings: "rep-app-settings";
};
/** Default sidebar state: expanded (false = not collapsed) */
export declare const SIDEBAR_DEFAULT_COLLAPSED = false;
/** Viewport width (px): below this = mobile (hamburger + bottom drawer) */
export declare const MOBILE_BREAKPOINT = 768;
/** Logo image URL (from public/brand/). Set to empty string to use inline SVG icon. */
export declare const BRAND_LOGO_URL = "/brand/logo.svg";
/** App language options for the user menu (single source of truth). */
export declare const REP_LANGUAGE_OPTIONS: {
  id: "en" | "pl" | "es";
  labelKey: string;
  nativeLabel: string;
  flag: string;
}[];
