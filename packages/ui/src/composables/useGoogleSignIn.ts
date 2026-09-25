import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { ApiFetchOptions } from "@api";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

/** Injection key for the API base URL ("" = same origin through the dev proxy).
 *  The Google flow is a top-level navigation, not a fetch, so it can't go through
 *  apiFetch and needs the base URL itself. Not provided → no Google button. */
export const API_URL_KEY = "neo:apiUrl";

/**
 * Codes apps/api/src/auth.ts's /auth/google/callback puts in /login?error=...
 * (see GOOGLE_SIGN_IN_ERRORS there) mapped to the message shown on the login
 * screen. Any other code the callback can send (auth_failed, token_exchange,
 * userinfo, server_config, ...) is a technical failure → the generic message.
 */
export const GOOGLE_SIGN_IN_ERROR_KEYS: Readonly<Record<string, string>> = {
  google_no_account: "user.login.google.error.noAccount",
  google_account_inactive: "user.login.google.error.inactive",
};
export const GOOGLE_SIGN_IN_GENERIC_ERROR_KEY = "user.login.google.error.failed";

/** i18n key for a /login?error= value, or null when there is no error to show. */
export function googleSignInErrorKey(code: unknown): string | null {
  if (typeof code !== "string" || !code) return null;
  return GOOGLE_SIGN_IN_ERROR_KEYS[code] ?? GOOGLE_SIGN_IN_GENERIC_ERROR_KEY;
}

/** Where the button sends the browser. `origin` tells the API which frontend to
 *  come back to (it only honours origins on its own FRONTEND_URL allowlist). */
export function googleSignInUrl(apiUrl: string, origin: string): string {
  return `${apiUrl}/api/v1/auth/google?origin=${encodeURIComponent(origin)}`;
}

export interface GoogleSignIn {
  /** True only once GET /auth/providers confirmed Google is configured here. */
  available: Ref<boolean>;
  href: ComputedRef<string>;
  /** Set when the user clicked and the browser is on its way to Google. */
  redirecting: Ref<boolean>;
  load: () => Promise<void>;
}

export function useGoogleSignIn(apiFetch: ApiFetchFn, apiUrl: string | null): GoogleSignIn {
  const available = ref(false);
  const redirecting = ref(false);
  const href = computed(() =>
    googleSignInUrl(apiUrl ?? "", typeof window !== "undefined" ? window.location.origin : ""),
  );

  async function load(): Promise<void> {
    if (apiUrl === null) return;
    try {
      const res = await apiFetch("/api/v1/auth/providers", { handleErrors: false });
      if (!res.ok) return;
      const body = (await res.json()) as { google?: unknown };
      available.value = body.google === true;
    } catch {
      // Unknown → keep the button hidden; password sign-in still works.
      available.value = false;
    }
  }

  return { available, href, redirecting, load };
}
