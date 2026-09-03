import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import router from "./index";
import { useAuthStore } from "../stores/auth";

/**
 * Router guard tests exercise the real singleton router (with its beforeEach
 * attached) against a fresh Pinia instance per test — auth state is seeded
 * directly on the store so no network call (fetchSession) is needed.
 */
describe("router guard: /login redirect for an already-authenticated user", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    // Reset onto a neutral route first — pushing straight to "/login" when the
    // router (a module-level singleton) is already sitting there from a prior
    // test/navigation is a no-op "duplicate navigation" that never re-runs
    // the guard, which would make these assertions pass for the wrong reason.
    await router.push("/forgot-password");
  });

  it("lands on /patients when there is no ?redirect param", async () => {
    const auth = useAuthStore();
    auth.sessionChecked = true;
    auth.user = { id: "1", email: "rep@example.com", role: "rep" };

    await router.push("/login");

    expect(router.currentRoute.value.path).toBe("/patients");
  });

  it("still honors an explicit ?redirect query param over the default", async () => {
    const auth = useAuthStore();
    auth.sessionChecked = true;
    auth.user = { id: "1", email: "rep@example.com", role: "rep" };

    await router.push("/login?redirect=%2Fplanner");

    expect(router.currentRoute.value.path).toBe("/planner");
  });
});
