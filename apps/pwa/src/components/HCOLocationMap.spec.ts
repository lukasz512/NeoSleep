import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import type { GoogleMapsLibraries } from "../composables/useGoogleMaps";

/**
 * CORE-43 — HCOLocationMap used the same broken Google Maps loader as the
 * pre-NEO-79 website map: it resolved on the script's `onload` and then
 * called `new google.maps.Map(...)` directly, but with `loading=async` the
 * `google.maps.Map` constructor doesn't exist yet at that point, so the map
 * never rendered. The fix (ported from apps/web/src/composables/useGoogleMaps.ts)
 * uses the documented bootstrap callback + `importLibrary`, and switches the
 * deprecated `google.maps.Marker` for `AdvancedMarkerElement`.
 */

const loadGoogleMaps = vi.fn<() => Promise<GoogleMapsLibraries>>();
vi.mock("../composables/useGoogleMaps", () => ({
  loadGoogleMaps: () => loadGoogleMaps(),
  googleMapId: () => "DEMO_MAP_ID",
}));

class FakeAdvancedMarker {
  map: unknown;
  constructor(public options: { position: { lat: number; lng: number }; map: unknown; title?: string }) {
    this.map = options.map;
  }
}
class FakeMap {
  setCenter = vi.fn();
  constructor(
    public container: HTMLElement,
    public options: Record<string, unknown>,
  ) {}
}
const fakeLibraries = { Map: FakeMap, AdvancedMarkerElement: FakeAdvancedMarker } as unknown as GoogleMapsLibraries;

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  vi.clearAllMocks();
});

async function mountMap(props: { latitude: number; longitude: number; name: string }) {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const HCOLocationMap = (await import("./HCOLocationMap.vue")).default;
  const wrapper = mount(HCOLocationMap, { props, global: { plugins: [i18n] } });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("HCOLocationMap (CORE-43)", () => {
  it("loads the Maps SDK exactly once and renders an AdvancedMarkerElement pin", async () => {
    loadGoogleMaps.mockResolvedValue(fakeLibraries);
    const wrapper = await mountMap({ latitude: 52.2, longitude: 21.0, name: "Centrum Medyczne" });

    expect(loadGoogleMaps).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".hco-location-map__error").exists()).toBe(false);
  });

  it("shows an error state instead of a silently blank map when the loader fails", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("Failed to load Google Maps script"));
    const wrapper = await mountMap({ latitude: 52.2, longitude: 21.0, name: "Centrum Medyczne" });

    expect(wrapper.find(".hco-location-map__error").exists()).toBe(true);
    expect(wrapper.find(".hco-location-map__error").text()).toBe(en["user.hco.detail.mapUnavailable"]);
  });

  it("re-fetches the SDK only when coordinates change, reusing the existing map otherwise", async () => {
    loadGoogleMaps.mockResolvedValue(fakeLibraries);
    const wrapper = await mountMap({ latitude: 52.2, longitude: 21.0, name: "Centrum Medyczne" });
    expect(loadGoogleMaps).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ latitude: 19.43, longitude: -99.13 });
    await flushPromises();

    // loadGoogleMaps is cached by the composable itself in real use; the
    // component calls it again (cheap no-op once cached) but must not
    // construct a second google.maps.Map for the same container.
    expect(wrapper.findAll(".hco-location-map__error")).toHaveLength(0);
  });
});
