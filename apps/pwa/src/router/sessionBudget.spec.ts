import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import router, { SESSION_CHECK_BUDGET_MS } from "./index";
import { useAuthStore } from "../stores/auth";

/**
 * NEO-52: /login must never wait on a slow session check (Render cold start,
 * bad network) for longer than SESSION_CHECK_BUDGET_MS. Past it the form shows
 * and the check keeps running; if it then finds a valid session, the router
 * moves on to the app by itself.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("router guard: session-check budget on /login", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    // Neutral public route whose guard never checks the session, so the
    // fresh Pinia's sessionChecked=false is still intact for /login below.
    await router.push("/partner-register");
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("shows /login after the budget even though the session check is still pending", async () => {
    const auth = useAuthStore();
    const pending = deferred<boolean>();
    vi.spyOn(auth, "fetchSession").mockReturnValue(pending.promise);

    let settled = false;
    const navigation = router.push("/login").then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(SESSION_CHECK_BUDGET_MS - 100);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    await navigation;
    expect(router.currentRoute.value.path).toBe("/login");

    pending.resolve(false);
  });

  it("moves on to the app once the late check finds a valid session", async () => {
    const auth = useAuthStore();
    const pending = deferred<boolean>();
    vi.spyOn(auth, "fetchSession").mockReturnValue(pending.promise);

    const navigation = router.push("/login");
    await vi.advanceTimersByTimeAsync(SESSION_CHECK_BUDGET_MS + 10);
    await navigation;
    expect(router.currentRoute.value.path).toBe("/login");

    auth.sessionChecked = true;
    auth.user = { id: "1", email: "rep@example.com", role: "rep" };
    pending.resolve(true);
    vi.useRealTimers();

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/patients"));
  });

  it("still waits for a fast check and redirects an already-signed-in user straight away", async () => {
    const auth = useAuthStore();
    vi.spyOn(auth, "fetchSession").mockImplementation(async () => {
      auth.sessionChecked = true;
      auth.user = { id: "1", email: "rep@example.com", role: "rep" };
      return true;
    });

    await router.push("/login");
    expect(router.currentRoute.value.path).toBe("/patients");
  });
});
