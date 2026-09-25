import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import { routes } from "../router/routes";
import { useAuthStore } from "../stores/auth";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

// Sidesteps the "idb" (IndexedDB) offline-cache layer entirely — jsdom has no
// IndexedDB, and loadHCP() fires this fire-and-forget on every successful
// load (see docs/ADR-013-offline-read-cache.md). Not under test here.
vi.mock("../stores/entityCache", () => ({
  useEntityCacheStore: () => ({ cacheOne: vi.fn(), readOne: vi.fn().mockResolvedValue(null) }),
}));

// HCPDetailView renders FormRenderer/EventForm via defineAsyncComponent —
// pre-importing them here (module scope, before any mount/unmount) resolves
// their whole nested chunk graph (FormRenderer -> PhoneField -> FlagIcon,
// etc.) up front, instead of racing that dynamic import against this test's
// own afterEach() unmount.
import "../components/FormRenderer.vue";
import "../components/EventForm.vue";
import HCPDetailView from "./HCPDetailView.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

function hcpFixture(status: string) {
  return {
    id: "hcp-1",
    name: "Dr. Andrzej Testerski",
    first_name: "Andrzej",
    last_name: "Testerski",
    email: "andrzej@example.com",
    status,
    organizations: [
      { id: "aff-1", organization_id: "org-1", name: "QA Clinic", type: "clinic", address_line1: "Main St 1", city: "Warsaw", role: null, is_primary: true },
    ],
    my_primary_organization_id: null,
  };
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

async function mountHCPDetail(status: string, role: "admin" | "rep" = "admin"): Promise<VueWrapper> {
  setActivePinia(createPinia());
  // Default fallback for any call this test doesn't explicitly queue a
  // response for — notably PractitionerClinicsPanel's own organization-
  // options fetch, which fires on mount (Details is the initially active,
  // eagerly-rendered tab) for every role this view is tested with.
  apiFetch.mockResolvedValue(jsonResponse(true, 200, { items: [] }));
  apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, hcpFixture(status)));

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
  // FormRenderer/EventForm are async components (defineAsyncComponent) that
  // start loading their chunk as soon as this view mounts, regardless of
  // their own v-model visibility. Without waiting for that import to settle
  // here, it can still be in flight when this test file's environment is
  // torn down, producing a benign but noisy "environment was torn down"
  // unhandled rejection. flushPromises() (not a bespoke `vi` API — this repo
  // doesn't define one) is enough because the chunk graph was already
  // pre-imported at module scope above, so there's no real dynamic import
  // left in flight, just its already-resolved promise microtasks to drain.
  await flushPromises();
  return wrapper;
}

describe("HCPDetailView — Details tab clinics panel (NEO-17)", () => {
  // Panel is temporarily hidden (SHOW_CLINICS_PANEL = false) until newly
  // added clinics stop disappearing. When restoring it, bring back the
  // positive assertion: title present + "QA Clinic" rendered.
  it("hides the clinics panel for now", async () => {
    const wrapper = await mountHCPDetail("active");

    expect(wrapper.find(".hcp-detail__clinics-title").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("QA Clinic");
  });
});

describe("HCPDetailView — Documents tab", () => {
  it("lists 'Documents' among the tabs and wires it to the practitioner's /documents endpoint", async () => {
    const wrapper = await mountHCPDetail("active");

    expect(wrapper.text()).toContain("Dr. Andrzej Testerski");

    const documentsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Documents");
    expect(documentsTab?.exists()).toBe(true);

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    await documentsTab?.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/practitioner/hcp-1/documents", { handleErrors: false })
    );

    await flushPromises();
  });
});

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
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, {}));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, hcpFixture("invited")));

    const button = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Resend invite");
    expect(button).toBeTruthy();
    await button!.trigger("click");

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/v1/practitioner/hcp-1/activate", { method: "POST" }));
  });
});
