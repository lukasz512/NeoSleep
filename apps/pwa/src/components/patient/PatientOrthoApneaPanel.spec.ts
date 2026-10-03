import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }) }));

import PatientOrthoApneaPanel from "./PatientOrthoApneaPanel.vue";
import { useAuthStore } from "../../stores/auth";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

const draftPlan = {
  id: "plan-1", dentist_id: null, dentist_name: null, appointment_at: null, scan_ordered_at: null,
  scan_received_at: null, scan_file_url: null, appliance_ordered_at: null, appliance_delivered_at: null,
  notes: null, status: "active", metadata: { orthoapneaDraft: {} }, order_number: null, order_sync_status: null, order_sent_at: null,
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
};

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountAs(role: string): Promise<VueWrapper> {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u-1", email: "qa@clinic.test", role } as ReturnType<typeof useAuthStore>["user"];
  apiFetch.mockImplementation((url: string) =>
    Promise.resolve(jsonResponse(url.includes("sleep-study-ref") ? { id: "study-1" } : { items: [draftPlan] }))
  );
  const wrapper = mount(PatientOrthoApneaPanel, {
    props: { patientId: "patient-1" },
    global: {
      plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })],
      stubs: { OrthoApneaOrderWizard: true, OrthoApneaTransactionLog: true, EntityLink: true },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("PatientOrthoApneaPanel — who may place a device order (NEO-199)", () => {
  it.each(["rep", "kam", "msl"])("a %s sees the orders but no new-order or continue-draft action", async (role) => {
    const wrapper = await mountAs(role);
    expect(wrapper.find('[data-testid="device-order-row"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="device-order-new"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="device-order-continue"]').exists()).toBe(false);
  });

  it.each(["admin", "doctor", "manager"])("a %s can start and continue an order", async (role) => {
    const wrapper = await mountAs(role);
    expect(wrapper.find('[data-testid="device-order-new"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="device-order-continue"]').exists()).toBe(true);
  });
});
