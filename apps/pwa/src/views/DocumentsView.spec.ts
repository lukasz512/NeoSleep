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

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import DocumentsView from "./DocumentsView.vue";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const SAMPLE_INDEX = [
  {
    templateKey: "informedConsent",
    locale: "en",
    label: "Patient Informed Consent (MAD)",
    hasContent: true,
    currentVersionNumber: 3,
    updatedAt: "2026-09-10T12:00:00.000Z",
  },
  {
    templateKey: "gdprConsent.mx",
    locale: "mx",
    label: "Doctor Data Protection Consent — Mexico (LFPDPPP)",
    hasContent: false,
    currentVersionNumber: null,
    updatedAt: null,
  },
];

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function mountDocumentsView(): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/documents");
  await router.isReady();

  const wrapper = mount(DocumentsView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe("DocumentsView", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("loads and lists every document from the index endpoint", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, SAMPLE_INDEX));
    const { wrapper } = await mountDocumentsView();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Patient Informed Consent"));

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/document-content", { handleErrors: false });
    expect(wrapper.text()).toContain("Doctor Data Protection Consent");
    expect(wrapper.text()).toContain("Published");
    expect(wrapper.text()).toContain("No content yet");
  });

  it("shows an error state and lets the admin retry when the index request fails", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, {}));
    const { wrapper } = await mountDocumentsView();
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Failed to load documents");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, SAMPLE_INDEX));
    await wrapper.find("button").trigger("click");
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it("navigates to the editor route for the clicked document's own templateKey/locale", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, SAMPLE_INDEX));
    const { wrapper, router } = await mountDocumentsView();
    await vi.waitFor(() => expect(wrapper.text()).toContain("Patient Informed Consent"));

    await wrapper.find("tbody tr").trigger("click");
    // The editor route's component is a dynamic import() — its first-ever
    // resolution in this test process can take more than one microtask
    // flush, so poll rather than asserting right after a single
    // flushPromises() (which was flaky here).
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe("document-content-detail"));
    expect(router.currentRoute.value.params).toEqual({ templateKey: "informedConsent", locale: "en" });
  });
});
