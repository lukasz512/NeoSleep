import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import type { AuthTokenStorage } from "@stores";
import { createUseChangePasswordFlow, PASSWORD_CHANGED_NOTICE } from "./useChangePasswordFlow";

function tokenStorage(): AuthTokenStorage & { access: string | null; refresh: string | null } {
  return {
    access: "old-access",
    refresh: "old-refresh",
    getAccessToken() { return this.access; },
    setAccessToken(v) { this.access = v; },
    getRefreshToken() { return this.refresh; },
    setRefreshToken(v) { this.refresh = v; },
  };
}

async function run(status: number) {
  const storage = tokenStorage();
  const apiFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status }));
  const useFlow = createUseChangePasswordFlow(apiFetch, storage);
  let flow!: ReturnType<typeof useFlow>;
  const Probe = defineComponent({
    setup() {
      flow = useFlow();
      return () => h("span");
    },
  });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: Probe }] });
  mount(Probe, { global: { plugins: [router] } });
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  flow.currentPassword.value = "old-password";
  flow.newPassword.value = "new-password";
  await flow.submit();
  await flushPromises();
  return { storage, assign, flow };
}

afterEach(() => vi.unstubAllGlobals());

describe("useChangePasswordFlow (NEO-102)", () => {
  // The server signs the account out everywhere on success, this device too.
  it("on success drops both tokens and reloads into login with the password-changed notice", async () => {
    const { storage, assign } = await run(200);
    expect(storage.access).toBeNull();
    expect(storage.refresh).toBeNull();
    expect(assign).toHaveBeenCalledWith(`/login?notice=${PASSWORD_CHANGED_NOTICE}`);
  });

  it("on a wrong current password keeps the session and shows the error", async () => {
    const { storage, assign, flow } = await run(401);
    expect(storage.access).toBe("old-access");
    expect(assign).not.toHaveBeenCalled();
    expect(flow.errorKey.value).toBe("user.changePassword.error.incorrectCurrent");
  });
});
