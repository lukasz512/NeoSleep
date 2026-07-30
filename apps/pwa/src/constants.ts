/**
 * API server base URL.
 * - Dev (default): empty string = use Vite proxy (/api, /auth → localhost:3000), no CORS.
 * - Prod / phone: set VITE_API_URL in .env (e.g. http://192.168.1.x:3000 for LAN).
 */
export function getApiUrl(): string {
  const env = typeof import.meta !== "undefined"
    ? (import.meta as { env?: { VITE_API_URL?: string; DEV?: boolean } }).env
    : undefined;
  const url = env?.VITE_API_URL;
  if (url !== undefined && url !== "") return url;
  return env?.DEV === true ? "" : "http://localhost:3000";
}

export const APP_STORAGE_KEYS = {
  /** Single key for all app settings (theme, locale, sidebar, filters). Later can sync to backend. */
  settings: "app-settings",
  /** Admin-only "view as" nav preview (see stores/rolePreview.ts) — separate key, not a general app setting. */
  rolePreview: "app-role-preview",
} as const;

/** Default sidebar state: expanded (false = not collapsed) */
export const SIDEBAR_DEFAULT_COLLAPSED = false;

/** Viewport width (px): below this = mobile (hamburger + bottom drawer) */
export const MOBILE_BREAKPOINT = 768;

/** App language options for the user menu (single source of truth). */
export { LANGUAGE_OPTIONS as REP_LANGUAGE_OPTIONS } from "@i18n/language-options";
