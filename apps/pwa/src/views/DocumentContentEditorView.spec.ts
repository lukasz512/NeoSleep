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

const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

import DocumentContentEditorView from "./DocumentContentEditorView.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const CURRENT_VERSION = {
  id: "v-2",
  template_key: "gdprConsent.pl",
  locale: "pl",
  content_html: "<p>Administrator: {legalEntityName} ({company}).</p>",
  version_number: 2,
  is_current: true,
  created_by_name: "Łukasz",
  created_at: "2026-09-15T10:00:00.000Z",
  change_note: "Clarified the data retention period",
};

const HISTORY = [
  CURRENT_VERSION,
  {
    id: "v-1",
    template_key: "gdprConsent.pl",
    locale: "pl",
    content_html: "<p>Old wording.</p>",
    version_number: 1,
    is_current: false,
    created_by_name: "Łukasz",
    created_at: "2026-09-01T10:00:00.000Z",
    change_note: null,
  },
];

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

async function mountEditor(): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push("/documents/gdprConsent.pl/pl");
  await router.isReady();

  const wrapper = mount(DocumentContentEditorView, { global: { plugins: [i18n, vuetify, router] } });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

describe("DocumentContentEditorView", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    notify.mockReset();
  });

  it("loads the current version and its history using the route's templateKey/locale", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, CURRENT_VERSION));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, HISTORY));
    const { wrapper } = await mountEditor();

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/v1/document-content/gdprConsent.pl/pl", { handleErrors: false });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/document-content/gdprConsent.pl/pl/versions", {
      handleErrors: false,
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Current version: 2");
    expect(wrapper.text()).toContain("Łukasz");
    expect(wrapper.text()).toContain("Clarified the data retention period");
  });

  it("wraps a literal {name} token from the loaded content as a protected chip in the editor", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, CURRENT_VERSION));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, HISTORY));
    const { wrapper } = await mountEditor();
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await wrapper.vm.$nextTick();

    const chip = wrapper.find("span[data-protected-token]");
    expect(chip.exists()).toBe(true);
    expect(chip.attributes("data-protected-token")).toBe("legalEntityName");
  });

  it("treats a 404 (no saved content yet) as an editable-but-empty first version, not an error", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 404, { error: "not found" }));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    const { wrapper } = await mountEditor();

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("Document not found");
    expect(wrapper.text()).toContain("has no saved content yet");
    expect(wrapper.find(".doc-editor__content").exists()).toBe(true);
  });

  it("saves the editor's content (with the protected token serialized back to plain {name} text) and refreshes the version", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, CURRENT_VERSION));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, HISTORY));
    const { wrapper } = await mountEditor();
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await wrapper.vm.$nextTick();

    const saveResponse = { ...CURRENT_VERSION, id: "v-3", version_number: 3 };
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, saveResponse));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, [saveResponse, ...HISTORY]));

    await wrapper.find("button.doc-editor__toolbar-btn").trigger("click"); // sanity: toolbar renders without throwing
    const saveButton = wrapper.findAll("button").find((b) => b.text().includes("Save new version"));
    await saveButton?.trigger("click");

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(4));
    const saveCall = apiFetch.mock.calls[2];
    expect(saveCall[0]).toBe("/api/v1/document-content/gdprConsent.pl/pl");
    const body = JSON.parse((saveCall[1] as RequestInit).body as string) as { contentHtml: string };
    expect(body.contentHtml).toContain("{legalEntityName}");
    expect(body.contentHtml).not.toContain("data-protected-token");

    expect(notify).toHaveBeenCalledWith("New version saved", "success");
  });
});
