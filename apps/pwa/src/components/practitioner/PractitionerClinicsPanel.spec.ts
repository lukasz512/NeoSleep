import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import { useAuthStore } from "../../stores/auth";
import type { OrganizationAffiliation } from "../../types/practitionerOrganization";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const notify = vi.fn();
vi.mock("../../composables/useNotifications", () => ({
  useNotifications: () => ({ show: notify }),
  retryAction: (run: () => unknown) => ({ labelKey: "notification.action.retry", run }),
}));

import PractitionerClinicsPanel from "./PractitionerClinicsPanel.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

function clinic(overrides: Partial<OrganizationAffiliation> = {}): OrganizationAffiliation {
  return {
    id: "aff-1",
    organization_id: "org-1",
    name: "QA Clinic",
    type: "clinic",
    address_line1: "Main St 1",
    city: "Warsaw",
    role: null,
    is_primary: false,
    ...overrides,
  };
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

function mountPanel(
  role: "admin" | "manager" | "rep" | "kam" | "msl",
  organizations: OrganizationAffiliation[] = [],
  myPrimaryOrganizationId: string | null = null
): VueWrapper {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: "u1", email: "qa@neosleepcare.com", role, name: "QA User" } as never;

  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PractitionerClinicsPanel, {
    props: { practitionerId: "prac-1", organizations, myPrimaryOrganizationId },
    global: { plugins: [i18n, vuetify] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("PractitionerClinicsPanel — rendering", () => {
  it("shows the empty state when there are no affiliations", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [] }));
    const wrapper = mountPanel("admin", []);
    expect(wrapper.text()).toContain("Not linked to any clinic yet.");
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  });

  it("renders each affiliation's name, type chip, and address", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [] }));
    const wrapper = mountPanel("admin", [clinic({ name: "Szpital Testowy", type: "hospital", address_line1: "ul. Testowa 5", city: "Kraków" })]);
    expect(wrapper.text()).toContain("Szpital Testowy");
    expect(wrapper.text()).toContain("Hospital");
    expect(wrapper.text()).toContain("ul. Testowa 5, Kraków");
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  });
});

describe("PractitionerClinicsPanel — add affiliation", () => {
  it("loads organization options on mount for a managing role (admin/manager/rep)", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [{ id: "org-2", name: "Other Clinic" }] }));
    mountPanel("rep", []);

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/v1/organization?limit=-1", { handleErrors: false }));
  });

  it("does not show the add picker for kam/msl (excluded from affiliation management)", () => {
    const wrapper = mountPanel("kam", []);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(wrapper.find(".practitioner-clinics-panel__add").exists()).toBe(false);
  });

  it("posts the selected organization and emits 'changed' on success", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [{ id: "org-2", name: "Other Clinic" }] }));
    const wrapper = mountPanel("admin", []);
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    // Drive the add flow through the component's own state rather than
    // simulating VAutocomplete's real dropdown interaction (brittle in
    // jsdom) — same reasoning EventForm's own specs use for VAutocomplete
    // fields elsewhere in this codebase.
    (wrapper.vm as unknown as { selectedOrgId: string | null }).selectedOrgId = "org-2";
    await wrapper.vm.$nextTick();

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { organizations: [] }));
    const addButton = wrapper.findAll("button").find((b) => b.text() === "Add clinic");
    await addButton?.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/practitioner/prac-1/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: "org-2" }),
        handleErrors: false,
      })
    );
    await vi.waitFor(() => expect(wrapper.emitted("changed")).toBeTruthy());
    expect(notify).toHaveBeenCalledWith("Clinic added", "success", undefined, expect.objectContaining({ icon: "nav-hco" }));
  });
});

describe("PractitionerClinicsPanel — remove affiliation", () => {
  it("shows a confirm dialog, then DELETEs and emits 'changed' on confirm", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [] }));
    const wrapper = mountPanel("admin", [clinic()]);
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    const removeButton = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Remove");
    await removeButton!.trigger("click");
    await wrapper.vm.$nextTick();
    // VDialog teleports to document.body — outside wrapper.element's own
    // subtree, so both the assertion and the confirm click below go through
    // the real document rather than wrapper.find*().
    expect(document.body.textContent).toContain("Remove this doctor from the clinic? This can't be undone.");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { organizations: [] }));
    const confirmButton = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Remove");
    await confirmButton!.dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/practitioner/prac-1/organizations/org-1", {
        method: "DELETE",
        handleErrors: false,
      })
    );
    await vi.waitFor(() => expect(wrapper.emitted("changed")).toBeTruthy());
  });
});

describe("PractitionerClinicsPanel — dual-scoped primary toggle", () => {
  it("admin can toggle the global primary star; PATCHes the primary endpoint", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [] }));
    const wrapper = mountPanel("admin", [clinic({ is_primary: false })]);
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { organizations: [clinic({ is_primary: true })], my_primary_organization_id: null }));
    const starButton = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Set as the default primary clinic");
    expect(starButton?.attributes("disabled")).toBeUndefined();
    await starButton!.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/practitioner/prac-1/organizations/org-1/primary", {
        method: "PATCH",
        handleErrors: false,
      })
    );
    await vi.waitFor(() => expect(wrapper.emitted("changed")).toBeTruthy());
  });

  it("rep sees a disabled global-primary star but an enabled 'mine' star, scoped to their own assignment", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { items: [] }));
    const wrapper = mountPanel("rep", [clinic()]);
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    const globalStar = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Set as the default primary clinic");
    expect(globalStar?.attributes("disabled")).toBeDefined();

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { organizations: [clinic()], my_primary_organization_id: "org-1" }));
    const mineStar = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Set as your primary clinic");
    await mineStar!.trigger("click");

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/practitioner/prac-1/organizations/org-1/primary", {
        method: "PATCH",
        handleErrors: false,
      })
    );
  });

  it("kam/msl see no 'mine' star at all (read-only, not part of the dual-scoped primary RBAC)", () => {
    const wrapper = mountPanel("kam", [clinic()]);
    expect(wrapper.findAll("button").some((b) => b.attributes("aria-label") === "Set as your primary clinic")).toBe(false);
  });
});
