/** Every localStorage key the rep app writes — one place, so nothing collides or leaks. */
export const APP_STORAGE_KEYS = {
  /** Single key for all app settings (theme, locale, sidebar, filters). Later can sync to backend. */
  settings: "app-settings",
  /** Admin-only "view as" nav preview (see stores/rolePreview.ts) — separate key, not a general app setting. */
  rolePreview: "app-role-preview",
  /** Refresh token only (ADR-020) — localStorage, so a reload/backgrounded PWA doesn't
   *  force a re-login. The short-lived access token itself is memory-only and re-derived
   *  from this on demand via POST /auth/refresh (see composables/useApi.ts). */
  refreshToken: "app-refresh-token",
  /** Id of the person signed in on this browser, so other tabs follow a sign-out or a
   *  switch to someone else (router/sessionLossRedirect.ts). */
  sessionUser: "app-session-user",
  /** "Add to device" card: how often the user said "Later" (NEO-87) — per device on purpose. */
  installCard: "app-install-card",
  /** Prefix of a patient's unsent questionnaire answers on their own device (composables/useQuestionnaireDraft.ts) —
   *  followed by a hash of the link token, never the token itself; cleared on submit, on an expired link and after 24h. */
  questionnaireDraftPrefix: "app-q-draft:",
} as const;
