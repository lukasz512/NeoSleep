import type { AuthTokenStorage } from "@stores";
import { createAuthStore } from "@stores";
import { apiFetch, setAuthInterceptor, getAuthToken, setAuthToken, clearAuthToken } from "../composables/useApi";

export type { UserRole, AuthUser, AuthTokenStorage } from "@stores";

/** Shared with packages/ui's createUseLoginFlow (see AuthView.vue, injected as
 *  "neo:authTokenStorage" in main.ts) — both must use the identical accessor so a
 *  login through either call site writes to the same storage the rest of the app reads. */
export const authTokenStorage: AuthTokenStorage = {
  get: getAuthToken,
  set: (token) => (token ? setAuthToken(token) : clearAuthToken()),
};

export const useAuthStore = createAuthStore(apiFetch, authTokenStorage);

/**
 * Register the auth interceptor callback with the API layer.
 *
 * A lazy getter (arrow function that calls useAuthStore() at invocation time)
 * is used to avoid the circular-import problem: api.ts cannot import from
 * stores/auth.ts, but stores/auth.ts can freely import from api.ts.
 * useAuthStore() is safe to call here at invocation time because Pinia is
 * always installed before any API request is made.
 */
setAuthInterceptor({
  clearAuth: () => useAuthStore().clearAuth(),
});
