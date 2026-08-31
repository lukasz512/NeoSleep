import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * fetch (the external boundary) is the only thing mocked here — env.js is
 * re-mocked per test via importService() so both the "configured" and
 * "not configured" paths are covered, same pattern as googleCalendar.spec.ts.
 */
async function importService(configured: boolean) {
  vi.doMock("../env.js", () => ({
    GOOGLE_MAPS_SERVER_API_KEY: configured ? "test-server-key" : undefined,
  }));
  vi.resetModules();
  return import("./geocoding.js");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geocodeAddress", () => {
  it("returns null without throwing when the API key isn't configured", async () => {
    const { geocodeAddress } = await importService(false);
    const result = await geocodeAddress({ address_line1: "123 Main St", city: "Warsaw", country_code: "PL" });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null without calling the API when the address has nothing to go on", async () => {
    const { geocodeAddress } = await importService(true);
    const result = await geocodeAddress({});
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns coordinates on a successful geocode", async () => {
    const { geocodeAddress } = await importService(true);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "OK", results: [{ geometry: { location: { lat: 52.2297, lng: 21.0122 } } }] }),
    } as Response);

    const result = await geocodeAddress({ address_line1: "123 Main St", city: "Warsaw", country_code: "PL" });
    expect(result).toEqual({ lat: 52.2297, lng: 21.0122 });
  });

  it("returns null (not a throw) when Google reports no match", async () => {
    const { geocodeAddress } = await importService(true);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ZERO_RESULTS", results: [] }),
    } as Response);

    const result = await geocodeAddress({ address_line1: "nonsense address", city: "Nowhere" });
    expect(result).toBeNull();
  });

  it("returns null (not a throw) on a network/HTTP failure", async () => {
    const { geocodeAddress } = await importService(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    const result = await geocodeAddress({ address_line1: "123 Main St", city: "Warsaw" });
    expect(result).toBeNull();
  });

  it("returns null (not a throw) when fetch itself rejects", async () => {
    const { geocodeAddress } = await importService(true);
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    const result = await geocodeAddress({ address_line1: "123 Main St", city: "Warsaw" });
    expect(result).toBeNull();
  });
});
