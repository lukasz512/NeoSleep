import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import EntityHistoryPanel from "./EntityHistoryPanel.vue";
import { useConfigStore } from "../stores/config";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

function mountPanel(endpoint = "/api/v1/patient/p-1/history"): VueWrapper {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(EntityHistoryPanel, { props: { endpoint }, global: { plugins: [i18n, vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("EntityHistoryPanel", () => {
  it("shows the empty state when the entity has no history, fetching whatever endpoint it's given", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { entries: [], lead_source: null }));
    const wrapper = mountPanel("/api/v1/practitioner/hcp-1/history");

    await vi.waitFor(() => expect(wrapper.text()).toContain("No history yet."));
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/practitioner/hcp-1/history", { handleErrors: false });
  });

  it("shows an error state when the request fails", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, { error: "boom" }));
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Could not load history."));
  });

  it("renders entries as a colored-icon timeline, one item per entry, with a connecting line", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, {
        entries: [
          {
            id: "h1",
            created_at: "2026-09-01T10:00:00.000Z",
            user_id: "u1",
            user_name: "Ann Rep",
            action: "create",
            entity_type: "Patient",
            entity_id: "p1",
            entity_before: null,
            entity_after: { status: "active" },
          },
          {
            id: "h2",
            created_at: "2026-09-02T10:00:00.000Z",
            user_id: "u1",
            user_name: "Ann Rep",
            action: "update",
            entity_type: "SleepStudy",
            entity_id: "s1",
            entity_before: { status: "pending" },
            entity_after: { status: "done" },
          },
        ],
        lead_source: null,
      })
    );
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.findAll("[data-test='history-entry']")).toHaveLength(2));

    // Semantic ordered lists, one per day, each introduced by a day heading.
    expect(wrapper.findAll("ol li[data-test='history-entry']")).toHaveLength(2);
    expect(wrapper.findAll("h3")).toHaveLength(2);

    // Each entry gets its own colored dot (keyed by action) with a decorative icon inside.
    const dots = wrapper.findAll(".entity-history-panel__dot");
    expect(dots).toHaveLength(2);
    expect(dots[0].classes()).toContain("bg-success"); // create
    expect(dots[1].classes()).toContain("bg-info"); // update
    expect(dots[0].attributes("aria-hidden")).toBe("true");
    expect(wrapper.findAll(".entity-history-panel__dot-icon")).toHaveLength(2);

    // Plain-language sentences, never raw model names or DB codes.
    expect(wrapper.text()).toContain("Patient record created");
    expect(wrapper.text()).not.toContain("SleepStudy");
  });

  it("names the new status in the headline and emphasizes clinical entries", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { entries: [statusChangeEntry], lead_source: null }));
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Sleep study status changed to Device shipped"));
    const entry = wrapper.get("[data-test='history-entry']");
    expect(entry.classes()).toContain("entity-history-panel__entry--clinical");
    expect(entry.text()).toContain("Clinical");
    // The headline already states the only change — no duplicate inline diff.
    expect(entry.find("[data-test='history-changes']").exists()).toBe(false);
  });

  it("shows inline field changes with a screen-reader sentence when the headline doesn't cover them", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, {
        entries: [
          {
            ...statusChangeEntry,
            entity_type: "Organization",
            entity_before: { name: "Clinic A", status: "active" },
            entity_after: { name: "Clinic B", status: "inactive" },
          },
        ],
        lead_source: null,
      })
    );
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.find("[data-test='history-changes']").exists()).toBe(true));
    const changes = wrapper.get("[data-test='history-changes']");
    expect(changes.findAll("li")).toHaveLength(2);
    expect(changes.text()).toContain("Name changed from Clinic A to Clinic B");
  });

  it("expands an audit details panel with exact timestamp, author, references and a before/after table", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { entries: [statusChangeEntry], lead_source: null }));
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.find("[data-test='history-toggle']").exists()).toBe(true));
    const toggle = wrapper.get("[data-test='history-toggle']");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find("[data-test='history-details']").exists()).toBe(false);

    await toggle.trigger("click");

    expect(toggle.attributes("aria-expanded")).toBe("true");
    const details = wrapper.get("[data-test='history-details']");
    expect(toggle.attributes("aria-controls")).toBe(details.attributes("id"));
    expect(details.get("time").attributes("datetime")).toBe(statusChangeEntry.created_at);
    expect(details.text()).toContain("Ann Rep");
    expect(details.text()).toContain("Audit reference");
    expect(details.text()).toContain("audit-00"); // short audit entry id
    const rows = details.findAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("Ordered");
    expect(rows[0].text()).toContain("Device shipped");
  });

  it("shows region names from the tenant region lookup instead of raw codes", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, {
        entries: [
          {
            ...statusChangeEntry,
            entity_type: "Patient",
            entity_before: { status: "active", region: "PL-MZ" },
            entity_after: { status: "active", region: "PL-PM" },
          },
        ],
        lead_source: null,
      })
    );
    const wrapper = mountPanel();
    const region = (key: string, value: string, sort_order: number) =>
      ({ key, value, locale: "en", sort_order, locked: false, custom: true });
    useConfigStore().options = {
      regions: [region("PL-MZ", "Mazowieckie", 1), region("PL-PM", "Pomorskie", 2)],
      specialties: [],
      organization_types: [],
    };

    await vi.waitFor(() => expect(wrapper.find("[data-test='history-changes']").exists()).toBe(true));
    const changes = wrapper.get("[data-test='history-changes']").text();
    expect(changes).toContain("Mazowieckie");
    expect(changes).toContain("Pomorskie");
    expect(changes).not.toContain("PL-MZ");
  });

  it("attributes entries without a user to the system", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, { entries: [{ ...statusChangeEntry, user_id: null, user_name: null }], lead_source: null })
    );
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.get(".entity-history-panel__meta").text()).toContain("System"));
  });

  it("shows an accessible skeleton while the first load is in flight", async () => {
    apiFetch.mockReturnValueOnce(new Promise(() => {}));
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.find("[data-test='history-skeleton']").exists()).toBe(true));
    const skeleton = wrapper.get("[data-test='history-skeleton']");
    expect(skeleton.attributes("role")).toBe("status");
    expect(skeleton.text()).toContain("Loading history…");
  });
});

const statusChangeEntry = {
  id: "audit-0001-0000-0000-000000000000",
  created_at: "2026-09-02T10:00:00.000Z",
  user_id: "u1",
  user_name: "Ann Rep",
  action: "update",
  entity_type: "SleepStudy",
  entity_id: "s1",
  entity_before: { status: "ordered" },
  entity_after: { status: "device_shipped" },
};
