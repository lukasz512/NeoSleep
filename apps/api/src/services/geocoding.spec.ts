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
    const result = await geocodeAddress({ address_line1: "123 Main St", city: "Warsaw", region_hint: "PL" });
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

    const result = await geocodeAddress({ address_line1: "123 Main St", city: "Warsaw", region_hint: "PL" });
    expect(result).toEqual({ lat: 52.2297, lng: 21.0122, countryCode: null });
  });

  // NEO-210 D1: the clinic's country comes from its address, so Google's
  // answer carries it — and the stored country (which the form used to fill
  // with the author's country) must not steer the lookup.
  it("returns the country Google resolves the address to", async () => {
    const { geocodeAddress } = await importService(true);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          geometry: { location: { lat: 19.29, lng: -99.65 } },
          address_components: [
            { short_name: "Toluca", types: ["locality", "political"] },
            { short_name: "Méx.", types: ["administrative_area_level_1", "political"] },
            { short_name: "MX", types: ["country", "political"] },
          ],
        }],
      }),
    } as Response);

    const result = await geocodeAddress({ address_line1: "Av. Ejemplo 200", city: "Toluca", state: "Estado de México", region_hint: "MX" });
    expect(result).toEqual({ lat: 19.29, lng: -99.65, countryCode: "MX" });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(url.searchParams.get("address")).toBe("Av. Ejemplo 200, Toluca, Estado de México");
    expect(url.searchParams.get("region")).toBe("mx");
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
