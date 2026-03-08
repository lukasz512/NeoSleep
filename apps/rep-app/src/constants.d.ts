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
/** Logo image URLs (from public/brand/logos/). Use logo_light for light theme, logo_dark for dark. Set to empty to use inline SVG icon. */
export declare const BRAND_LOGO_LIGHT_URL = "/brand/logos/logo_light.svg";
export declare const BRAND_LOGO_DARK_URL = "/brand/logos/logo_dark.svg";
/** App language options for the user menu (single source of truth). */
export declare const REP_LANGUAGE_OPTIONS: {
  id: "en" | "pl" | "es";
  labelKey: string;
  nativeLabel: string;
  flag: string;
}[];
