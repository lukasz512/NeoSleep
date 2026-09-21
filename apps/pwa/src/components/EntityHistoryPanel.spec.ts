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

    await vi.waitFor(() => expect(wrapper.findAll(".v-timeline-item")).toHaveLength(2));

    // A real vertical line connecting the entries, not a bare list.
    expect(wrapper.find(".v-timeline").exists()).toBe(true);

    // Each entry gets its own colored dot (keyed by action) with an icon inside.
    const dots = wrapper.findAll(".v-timeline-divider__inner-dot");
    expect(dots).toHaveLength(2);
    expect(dots[0].classes()).toContain("bg-success"); // create
    expect(dots[1].classes()).toContain("bg-info"); // update
    expect(wrapper.findAll(".entity-history-panel__dot-icon")).toHaveLength(2);

    // entity_type is humanized via i18n, not the raw model name.
    expect(wrapper.text()).toContain("Sleep Study");
    expect(wrapper.text()).not.toContain("SleepStudy");

    // Existing before → after diff summary is preserved.
    expect(wrapper.text()).toContain("status: pending → done");
  });
});
