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

const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({
  useNotifications: () => ({ show: notify }),
  retryAction: (run: () => unknown) => ({ labelKey: "notification.action.retry", run }),
}));

const openMock = vi.fn();
vi.stubGlobal("open", openMock);

import EntityDocumentsPanel from "./EntityDocumentsPanel.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
  openMock.mockReset();
});

function mountPanel(endpoint = "/api/v1/practitioner/hcp-1/documents"): VueWrapper {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(EntityDocumentsPanel, { props: { endpoint }, global: { plugins: [i18n, vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("EntityDocumentsPanel", () => {
  it("shows the empty state when the entity has no documents", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    const wrapper = mountPanel();

    // Poll the rendered output, not the mock's call count: apiFetch is
    // invoked synchronously during mount (before any await resolves), so a
    // call-count check alone can pass before res.json()/loading=false have
    // actually run — waiting on the DOM itself avoids that race.
    await vi.waitFor(() => expect(wrapper.text()).toContain("No signed documents yet."));
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/practitioner/hcp-1/documents", { handleErrors: false });
  });

  it("renders known document types with a friendly label and falls back to the raw type otherwise", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, 200, [
        { id: "d1", documentType: "gdpr", filename: "gdpr.pdf", mimeType: "application/pdf", signedAt: "2026-09-01T10:00:00.000Z" },
        { id: "d2", documentType: "some_future_type", filename: "future.pdf", mimeType: "application/pdf", signedAt: "2026-09-02T10:00:00.000Z" },
      ])
    );
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("GDPR consent"));
    expect(wrapper.text()).toContain("some_future_type");
  });

  it("downloads a document by opening the short-lived signed URL", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, 200, [
        { id: "d1", documentType: "gdpr", filename: "gdpr.pdf", mimeType: "application/pdf", signedAt: "2026-09-01T10:00:00.000Z" },
      ])
    );
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.text()).toContain("GDPR consent"));

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { url: "https://example.test/signed.pdf" }));
    const downloadButton = wrapper.findAll("button").find((b) => b.text().includes("Download PDF"));
    await downloadButton?.trigger("click");

    await vi.waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/practitioner/hcp-1/documents/d1/download", { handleErrors: false });
    expect(openMock).toHaveBeenCalledWith("https://example.test/signed.pdf", "_blank", "noopener");
  });

  it("shows an error notification when the list request fails", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 500, { error: "boom" }));
    mountPanel();

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Could not load documents.", "error", undefined, expect.objectContaining({ icon: "file" })));
  });

  it("Retry on the load-error toast loads the list again and shows the documents", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 500, { error: "boom" }));
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    const options = notify.mock.calls[0][3] as { action?: { labelKey: string; run: () => unknown } };
    expect(options.action?.labelKey).toBe("notification.action.retry");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, [{ id: "d1", documentType: "gdpr", filename: "gdpr.pdf", mimeType: "application/pdf", signedAt: "2026-09-01T10:00:00.000Z" }]));
    await options.action?.run();

    expect(apiFetch).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(wrapper.text()).toContain("GDPR consent"));
  });
});
