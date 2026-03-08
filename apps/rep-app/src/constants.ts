/**
 * BFF base URL for auth and API.
 * - Dev (default): empty string = use Vite proxy (/api, /auth → localhost:3000), no CORS.
 * - Prod / phone: set VITE_BFF_URL in .env (e.g. http://192.168.1.x:3000 for LAN).
 */
export function getBffUrl(): string {
  const env = typeof import.meta !== "undefined" && (import.meta as { env?: { VITE_BFF_URL?: string; DEV?: boolean } }).env;
  const url = env?.VITE_BFF_URL;
  if (url !== undefined && url !== "") return url;
  return env?.DEV === true ? "" : "http://localhost:3000";
}

export const REP_STORAGE_KEYS = {
  /** Single key for all rep-app settings (theme, locale, sidebar, filters). Later can sync to backend. */
  settings: "rep-app-settings",
} as const;

/** Default sidebar state: expanded (false = not collapsed) */
export const SIDEBAR_DEFAULT_COLLAPSED = false;

/** Viewport width (px): below this = mobile (hamburger + bottom drawer) */
export const MOBILE_BREAKPOINT = 768;

/** Logo image URLs (from public/brand/logos/). Use logo_light for light theme, logo_dark for dark. Set to empty to use inline SVG icon. */
export const BRAND_LOGO_LIGHT_URL = "/brand/logos/logo_light.svg";
export const BRAND_LOGO_DARK_URL = "/brand/logos/logo_dark.svg";

/** App language options for the user menu (single source of truth). */
export { LANGUAGE_OPTIONS as REP_LANGUAGE_OPTIONS } from "../../../i18n/language-options";
