import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import { routes } from "../router/routes";
import { useAuthStore } from "../stores/auth";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import HCPDetailView from "./HCPDetailView.vue";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, status: ok ? 200 : 404, json: async () => body } as Response;
}

function hcpFixture(status: string) {
  return {
    id: "hcp-1",
    name: "Dr. Andrzej Testerski",
    first_name: "Andrzej",
    last_name: "Testerski",
    email: "andrzej@example.com",
    status,
  };
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountHCPDetail(status: string, role: "admin" | "rep" = "admin"): Promise<VueWrapper> {
  setActivePinia(createPinia());
  apiFetch.mockResolvedValueOnce(jsonResponse(true, hcpFixture(status)));

  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/hcp/hcp-1");
  await router.isReady();

  const auth = useAuthStore();
  auth.user = { id: "u1", email: "admin@neosleepcare.com", role, name: "QA Admin" } as never;

  const wrapper = mount(HCPDetailView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  await wrapper.vm.$nextTick();
  // HCPDetailView's template unconditionally contains <FormRenderer>, a
  // defineAsyncComponent — merely mounting this view kicks off its dynamic
  // import (and PhoneField's own nested scoped-CSS chunk within it) even
  // though the edit modal itself is never opened by these tests. Without
  // waiting for that import to settle here, it can still be in flight when
  // this test file's environment is torn down, throwing an unhandled
  // "EnvironmentTeardownError" rejection that fails the whole run despite
  // every assertion passing (confirmed via quality-gate.sh, 2026-09-17).
  await vi.dynamicImportSettled();
  return wrapper;
}

describe("HCPDetailView — invite/resend status handling", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  function activateButton(wrapper: VueWrapper) {
    // The VTooltip's own slotted label text only renders on hover/focus in
    // a real browser — not present in jsdom without triggering that
    // interaction — so assert on the button's own static aria-label
    // instead of wrapper.text(), which only sees currently-visible text.
    return wrapper.findAll("button").find((b) => b.attributes("aria-label")?.includes("activate") || b.attributes("aria-label")?.includes("Resend") || b.attributes("aria-label")?.includes("Training"));
  }

  it("shows 'Training finished — activate' and no status badge for a pending_approval doctor", async () => {
    const wrapper = await mountHCPDetail("pending_approval");
    const button = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Training finished — activate");
    expect(button).toBeTruthy();
    expect(wrapper.find(".hcp-detail__status-badge").exists()).toBe(false);
  });

  it("shows 'Resend invite' and the 'Invited, awaiting doctor' badge for an invited doctor", async () => {
    const wrapper = await mountHCPDetail("invited");
    const button = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Resend invite");
    expect(button).toBeTruthy();
    expect(wrapper.findAll("button").some((b) => b.attributes("aria-label") === "Training finished — activate")).toBe(false);
    const badge = wrapper.find(".hcp-detail__status-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("Invited, awaiting doctor");
  });

  it("shows neither the activate/resend button nor the badge once the doctor is fully active", async () => {
    const wrapper = await mountHCPDetail("active");
    expect(activateButton(wrapper)).toBeUndefined();
    expect(wrapper.find(".hcp-detail__status-badge").exists()).toBe(false);
  });

  it("hides the activate/resend action entirely for a role that isn't admin/manager", async () => {
    const wrapper = await mountHCPDetail("invited", "rep");
    expect(activateButton(wrapper)).toBeUndefined();
  });

  it("resending posts to the activate endpoint and shows the resend-specific success message", async () => {
    const wrapper = await mountHCPDetail("invited");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, {}));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, hcpFixture("invited")));

    const button = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Resend invite");
    expect(button).toBeTruthy();
    await button!.trigger("click");

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/v1/practitioner/hcp-1/activate", { method: "POST" }));
  });
});
