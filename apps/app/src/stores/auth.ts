import { createAuthStore } from "@stores";
import { apiFetch, setAuthInterceptor } from "../utils/api";

export type { UserRole, AuthUser } from "@stores";

export const useAuthStore = createAuthStore(apiFetch);

/**
 * Register auth interceptor callbacks with the API layer.
 *
 * Lazy getters (arrow functions that call useAuthStore() at invocation time)
 * are used to avoid the circular-import problem: api.ts cannot import from
 * stores/auth.ts, but stores/auth.ts can freely import from api.ts.
 * useAuthStore() is safe to call here at invocation time because Pinia is
 * always installed before any API request is made.
 */
setAuthInterceptor({
  getToken:   () => useAuthStore().accessToken,
  tryRefresh: () => useAuthStore().tryRefresh(),
  clearAuth:  () => useAuthStore().clearAuth(),
});
