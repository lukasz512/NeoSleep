import { createAuthStore } from "@stores";
import { apiFetch, setAuthInterceptor } from "../composables/useApi";

export type { UserRole, AuthUser } from "@stores";

export const useAuthStore = createAuthStore(apiFetch);

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
