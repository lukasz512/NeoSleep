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
  /** Refresh token only (ADR-020) — localStorage, so a reload/backgrounded PWA doesn't
   *  force a re-login. The short-lived access token itself is memory-only and re-derived
   *  from this on demand via POST /auth/refresh (see composables/useApi.ts). */
  refreshToken: "app-refresh-token",
  /** "Add to device" card: how often the user said "Later" (NEO-87) — per device on purpose. */
  installCard: "app-install-card",
} as const;

/** Default sidebar state: expanded (false = not collapsed) */
export const SIDEBAR_DEFAULT_COLLAPSED = false;

/** Desktop side-menu collapse toggle. Hidden for now (Łukasz, 2026-09-25): the
 *  menu always renders expanded and a previously saved collapsed state is
 *  ignored, so nobody is stuck in a rail with no way back out. */
export const SIDEBAR_COLLAPSE_ENABLED = false;

/** Viewport width (px): below this = mobile (hamburger + bottom drawer) */
export const MOBILE_BREAKPOINT = 768;

/** App language options for the user menu (single source of truth). */
export { LANGUAGE_OPTIONS as REP_LANGUAGE_OPTIONS } from "@i18n/language-options";

/**
 * Where "report incident" CTAs (e.g. a partner integration being down) send
 * a mailto: — same inbox as the backend's own RESEND_NOTIFY_TO. Interim,
 * manual reporting; proper backend-side incident capture + automation is
 * tracked as a follow-up, not built yet.
 */
export const SUPPORT_EMAIL = "neosleepcare@gmail.com";
