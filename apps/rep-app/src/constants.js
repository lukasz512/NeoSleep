/** BFF base URL for auth and API. Set VITE_BFF_URL in .env for production. */
export function getBffUrl() {
    return (typeof import.meta !== "undefined" && import.meta.env?.VITE_BFF_URL) ?? "http://localhost:3000";
}
export const REP_STORAGE_KEYS = {
    /** Single key for all rep-app settings (theme, locale, sidebar, filters). Later can sync to backend. */
    settings: "rep-app-settings",
};
/** Default sidebar state: expanded (false = not collapsed) */
export const SIDEBAR_DEFAULT_COLLAPSED = false;
/** Viewport width (px): below this = mobile (hamburger + bottom drawer) */
export const MOBILE_BREAKPOINT = 768;
/** Logo image URLs (from shared brand/ at repo root). Use logo_light for light theme, logo_dark for dark. Set to empty to use inline SVG icon. */
export const BRAND_LOGO_LIGHT_URL = "/brand/logos/logo/logo_light.svg";
export const BRAND_LOGO_DARK_URL = "/brand/logos/logo/logo_dark.svg";
/** App language options for the user menu (single source of truth). */
export const REP_LANGUAGE_OPTIONS = [
  { id: "en", labelKey: "app.language.en", nativeLabel: "English", flag: "🇬🇧" },
  { id: "pl", labelKey: "app.language.pl", nativeLabel: "Polski", flag: "🇵🇱" },
  { id: "es", labelKey: "app.language.es", nativeLabel: "Español", flag: "🇪🇸" },
];
