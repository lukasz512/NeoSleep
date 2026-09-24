import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { createAuthStore, type AuthTokenStorage } from "./auth";

/**
 * fetchSession robustness (NEO-52): the PWA router no longer blocks the login
 * form on a slow session check, so the check can still be in flight when the
 * user signs in — its late answer must not undo that login — and concurrent
 * callers must share one request instead of stacking duplicates.
 */

function createTokenStorage(refreshToken: string | null = "stored-refresh"): AuthTokenStorage {
  let access: string | null = null;
  let refresh = refreshToken;
  return {
    getAccessToken: () => access,
    setAccessToken: (t) => (access = t),
    getRefreshToken: () => refresh,
    setRefreshToken: (t) => (refresh = t),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const USER = { id: "1", email: "rep@example.com", role: "rep" as const };

describe("auth store — fetchSession", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("a late 401 from a slow session check does not undo a login that completed meanwhile", async () => {
    const pending = deferred<Response>();
    const apiFetch = vi.fn().mockReturnValue(pending.promise);
    const store = createAuthStore(apiFetch, createTokenStorage())();

    const check = store.fetchSession();
    store.setAuthenticated(true, USER, "access", "refresh");
    pending.resolve(new Response("{}", { status: 401 }));

    await expect(check).resolves.toBe(true);
    expect(store.user).toEqual(USER);
    expect(store.isAuthenticated).toBe(true);
  });

  it("a late successful check does not resurrect a user who logged out meanwhile", async () => {
    const pending = deferred<Response>();
    const apiFetch = vi.fn().mockReturnValue(pending.promise);
    const store = createAuthStore(apiFetch, createTokenStorage())();

    const check = store.fetchSession();
    store.clearAuth();
    pending.resolve(new Response(JSON.stringify({ user: USER }), { status: 200 }));

    await expect(check).resolves.toBe(false);
    expect(store.user).toBeNull();
  });

  it("concurrent callers share one in-flight request and sessionChecking tracks it", async () => {
    const pending = deferred<Response>();
    const apiFetch = vi.fn().mockReturnValue(pending.promise);
    const store = createAuthStore(apiFetch, createTokenStorage())();

    const first = store.fetchSession();
    const second = store.fetchSession();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(store.sessionChecking).toBe(true);

    pending.resolve(new Response(JSON.stringify({ user: USER }), { status: 200 }));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(store.sessionChecking).toBe(false);
    expect(store.sessionChecked).toBe(true);
  });

  it("without a stored refresh token it settles immediately, no request", async () => {
    const apiFetch = vi.fn();
    const store = createAuthStore(apiFetch, createTokenStorage(null))();

    await expect(store.fetchSession()).resolves.toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(store.sessionChecked).toBe(true);
    expect(store.sessionChecking).toBe(false);
  });
});
