import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("./useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("../constants", () => ({ getApiUrl: () => "https://api.example.test" }));

async function load() {
  vi.resetModules(); // module-level cache per test
  return import("./usePartnerResources");
}

beforeEach(() => apiFetch.mockReset());

describe("usePartnerResources", () => {
  it("points webinar URLs at the API host with the media token, not at the PWA's own host", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        mediaToken: "tok",
        resources: [
          {
            id: "26",
            kind: "video",
            mediaUrl: "/api/v1/partners/orthoapnea/resources/26/media?locale=mx",
            languages: [{ code: "EN", mediaUrl: "/api/v1/partners/orthoapnea/resources/26/media?locale=mx&lang=En" }],
          },
        ],
      }),
    });
    const { usePartnerResources } = await load();
    const { videos, load: loadResources } = usePartnerResources();
    await loadResources("mx");

    expect(videos.value[0]!.mediaUrl).toBe(
      "https://api.example.test/api/v1/partners/orthoapnea/resources/26/media?locale=mx&t=tok"
    );
    expect(videos.value[0]!.languages[0]!.mediaUrl).toBe(
      "https://api.example.test/api/v1/partners/orthoapnea/resources/26/media?locale=mx&lang=En&t=tok"
    );
  });

  it("re-fetches after a few hours so cached webinar URLs never outlive their media token", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ mediaToken: "tok", resources: [] }) });
    const { usePartnerResources } = await load();
    const { load: loadResources } = usePartnerResources();
    vi.useFakeTimers();
    try {
      await loadResources("mx");
      await loadResources("mx");
      expect(apiFetch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(3 * 60 * 60 * 1000 + 1);
      await loadResources("mx");
      expect(apiFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
