import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";
import type { GoogleMapsLibraries } from "../composables/useGoogleMaps";

/**
 * NEO-81 — the find-a-specialist page must never fail silently again:
 *   - a Google Maps failure never hides the clinic list, and
 *   - a failed specialists request says *why* (connection vs. our side) and
 *     leaves a console line + a diagnostics report.
 * NEO-79 — the option A redesign: list + map, client-side search that
 * understands specialty words in every site language, call-first cards,
 * list ↔ pin selection, loading / empty / no-match states, phone toggle.
 */

const loadGoogleMaps = vi.fn<() => Promise<GoogleMapsLibraries>>();
vi.mock("../composables/useGoogleMaps", () => ({
  loadGoogleMaps: () => loadGoogleMaps(),
  googleMapId: () => "DEMO_MAP_ID",
  onGoogleMapsAuthFailure: () => () => undefined,
}));

const clusterer = { addMarkers: vi.fn(), clearMarkers: vi.fn() };
vi.mock("@googlemaps/markerclusterer", () => ({
  MarkerClusterer: class {
    addMarkers = clusterer.addMarkers;
    clearMarkers = clusterer.clearMarkers;
  },
}));
vi.mock("../composables/useSeoMeta", () => ({ useSeoMeta: () => undefined }));
vi.mock("../composables/useReveal", async () => {
  const { ref } = await import("vue");
  return { useReveal: () => ref(true) };
});

// ── A minimal stand-in for the Maps SDK: records what the page asks of it ──
interface FakeMarkerOptions {
  title?: string | null;
  position?: { lat: number; lng: number };
}
const fakeMarkers: FakeMarker[] = [];
const fakeMaps: FakeMap[] = [];
class FakeMarker {
  listeners = new Map<string, () => void>();
  zIndex: number | null = null;
  constructor(public options: FakeMarkerOptions) {
    fakeMarkers.push(this);
  }
  addEventListener(event: string, handler: () => void) {
    this.listeners.set(event, handler);
  }
}
class FakeMap {
  panTo = vi.fn();
  setZoom = vi.fn();
  setCenter = vi.fn();
  fitBounds = vi.fn();
  getZoom = () => 5;
  constructor() {
    fakeMaps.push(this);
  }
}
class FakeBounds {
  extend() {
    return this;
  }
}
// The fakes implement only the members the page calls; the cast is the test seam.
const fakeLibraries = {
  Map: FakeMap,
  LatLngBounds: FakeBounds,
  AdvancedMarkerElement: FakeMarker,
} as unknown as GoogleMapsLibraries;

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

const SPECIALISTS = [
  {
    id: "org-1",
    name: "Clínica Dental Roma Norte",
    address_line1: "Av. Álvaro Obregón 120",
    city: "Ciudad de México",
    state: "CDMX",
    country_code: "MX",
    phone: "+52 55 1234 5678",
    website: null,
    google_link: null,
    specialties: ["dentist"],
    latitude: 19.4189,
    longitude: -99.1606,
    practitioners: [],
  },
  {
    id: "org-2",
    name: "Instituto del Sueño Del Valle",
    address_line1: "Av. Eugenia 926",
    city: "Ciudad de México",
    state: "CDMX",
    country_code: "MX",
    phone: null,
    website: "example.com/sueno",
    google_link: "https://maps.app.goo.gl/abc",
    specialties: ["ent"],
    latitude: 19.3857,
    longitude: -99.1633,
    practitioners: [{ id: "p-1", name: "Dr. Jorge Mendoza", specialties: ["ent"] }],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Let the view's two retry delays (1.5 s, 3 s) elapse, settling each attempt in between. */
async function runRetries() {
  for (let i = 0; i < 3; i++) {
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
  }
}

async function mountView() {
  const { default: FindSpecialistView } = await import("./FindSpecialistView.vue");
  const i18n = createI18n({ legacy: false, locale: "en", fallbackLocale: "en", messages: { en, pl, mx } });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div/>" } }, { path: "/contact", component: { template: "<div/>" } }] });
  await router.push("/");
  await router.isReady();
  const wrapper = mount(FindSpecialistView, { global: { plugins: [i18n, router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  // Only setTimeout is faked (the view's retry delays); setImmediate stays real so
  // flushPromises() keeps working — deterministic even on a loaded CI box.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockReset();
  loadGoogleMaps.mockReset();
  clusterer.addMarkers.mockReset();
  clusterer.clearMarkers.mockReset();
  fakeMarkers.length = 0;
  fakeMaps.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  // jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("FindSpecialistView — error handling (NEO-81)", () => {
  it("a Maps failure keeps the clinic list and says only the map is unavailable", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("VITE_GOOGLE_MAPS_BROWSER_API_KEY is not configured"));
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Clínica Dental Roma Norte");
    expect(wrapper.text()).toContain(en["website.findSpecialist.mapUnavailable"]);
    expect(wrapper.text()).not.toContain(en["website.findSpecialist.loadError"]);
    // Not silent any more: the Maps failure is logged.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("web.FindSpecialistView.loadMap"), expect.any(Error));
  });

  it("an unreachable API says to check the connection and logs it, after the retries", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("no key"));
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const wrapper = await mountView();
    await runRetries();

    expect(fetchMock).toHaveBeenCalledTimes(3); // first try + 2 retries
    expect(wrapper.text()).toContain(en["common.error.network.title"]);
    expect(wrapper.text()).toContain(en["website.findSpecialist.retry"]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("web.FindSpecialistView.fetchSpecialists"),
      expect.anything(),
    );
  });

  it("a 200 carrying the website's own HTML (missing API URL) is 'a problem on our side', not silence", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("no key"));
    fetchMock.mockResolvedValue(
      new Response("<!doctype html><div id=app></div>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    const wrapper = await mountView();
    await runRetries();

    expect(wrapper.text()).toContain(en["common.error.server.title"]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("web.FindSpecialistView.fetchSpecialists"),
      expect.anything(),
    );
  });

  it("a 429 is not retried and says to wait", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("no key"));
    fetchMock.mockResolvedValue(jsonResponse({ error: "Too many requests, please try again later" }, 429));

    const wrapper = await mountView();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(en["common.error.rateLimited.title"]);
  });

  it("the retry button on the error state loads the list again", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("no key"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Too many requests" }, 429));
    fetchMock.mockResolvedValueOnce(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    const retryButton = wrapper.findAll("button").find((b) => b.text() === en["website.findSpecialist.retry"] && b.element.closest(".fs-state"));
    await retryButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Clínica Dental Roma Norte");
  });
});

describe("FindSpecialistView — list, search and states (NEO-79)", () => {
  beforeEach(() => {
    loadGoogleMaps.mockRejectedValue(new Error("no key"));
  });

  it("shows a skeleton and a screen-reader status while loading", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));

    const wrapper = await mountView();

    expect(wrapper.findAll(".fs-card--skeleton")).toHaveLength(3);
    expect(wrapper.find('[role="status"]').text()).toBe(en["website.findSpecialist.loading"]);
  });

  it("loads the whole directory once, without a search parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    await wrapper.find("#fs-search-input").setValue("roma");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/v1\/public\/specialists$/);
  });

  it("the card leads with Call (tel: link, number shown), then directions; hides actions without data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    const [first, second] = wrapper.findAll(".fs-card");

    const call = first!.find(".fs-card__action--primary");
    expect(call.attributes("href")).toBe("tel:+525512345678");
    expect(call.text()).toContain(en["website.findSpecialist.call"]);
    expect(call.text()).toContain("+52 55 1234 5678");
    expect(first!.text()).toContain(en["website.findSpecialist.specialty.dentist"]);
    const firstLinks = first!.findAll("a").map((a) => a.attributes("href"));
    expect(firstLinks).toContain("https://www.google.com/maps/dir/?api=1&destination=19.4189,-99.1606");
    expect(first!.text()).not.toContain(en["website.findSpecialist.website"]); // website is null

    // No phone → no call action; its own Google link and a normalized website instead.
    expect(second!.find(".fs-card__action--primary").exists()).toBe(false);
    const secondLinks = second!.findAll("a").map((a) => a.attributes("href"));
    expect(secondLinks).toContain("https://maps.app.goo.gl/abc");
    expect(secondLinks).toContain("https://example.com/sueno");
    expect(second!.text()).toContain("Dr. Jorge Mendoza");
  });

  it.each(["dentista", "dentysta", "Dentist", "roma norte", "cdmx dentista"])(
    "searching %s finds the dentist and not the ENT clinic",
    async (query) => {
      fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

      const wrapper = await mountView();
      await wrapper.find("#fs-search-input").setValue(query);

      const names = wrapper.findAll(".fs-card__title").map((h) => h.text());
      expect(names).toEqual(["Clínica Dental Roma Norte"]);
      expect(wrapper.find(".fs-results__count").text()).toBe("Results: 1");
    },
  );

  it("a doctor's name finds their clinic, accent-insensitive", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    await wrapper.find("#fs-search-input").setValue("mendoza");

    expect(wrapper.findAll(".fs-card__title").map((h) => h.text())).toEqual(["Instituto del Sueño Del Valle"]);

    await wrapper.find("#fs-search-input").setValue("instituto del sueno");
    expect(wrapper.findAll(".fs-card__title").map((h) => h.text())).toEqual(["Instituto del Sueño Del Valle"]);
  });

  it("no match shows its own state, and clearing brings the list back", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    await wrapper.find("#fs-search-input").setValue("Monterrey");

    expect(wrapper.findAll(".fs-card:not(.fs-card--skeleton)")).toHaveLength(0);
    expect(wrapper.text()).toContain("No specialists match “Monterrey”");
    expect(wrapper.find('a[href="/contact?type=patient"]').exists()).toBe(true);

    const clear = wrapper.findAll(".fs-state button").find((b) => b.text() === en["website.findSpecialist.clearSearch"]);
    await clear!.trigger("click");
    expect(wrapper.findAll(".fs-card")).toHaveLength(2);
  });

  it("an empty directory says so and offers to be notified", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: [] }));

    const wrapper = await mountView();

    expect(wrapper.text()).toContain(en["website.findSpecialist.network.emptyTitle"]);
    expect(wrapper.text()).toContain(en["website.findSpecialist.notifyMe"]);
    expect(wrapper.find(".fs-chips").exists()).toBe(false);
  });

  it("specialty chips come from the data and filter the list", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    const chips = wrapper.findAll(".fs-chip");
    expect(chips.map((c) => c.text())).toEqual([
      en["website.findSpecialist.filterAll"],
      en["website.findSpecialist.specialty.dentist"],
      en["website.findSpecialist.specialty.ent"],
    ]);

    await chips[2]!.trigger("click");
    expect(chips[2]!.attributes("aria-pressed")).toBe("true");
    expect(wrapper.findAll(".fs-card__title").map((h) => h.text())).toEqual(["Instituto del Sueño Del Valle"]);
  });

  it("the List / Map toggle switches which half is shown (phone layout)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));

    const wrapper = await mountView();
    const [listBtn, mapBtn] = wrapper.findAll(".fs-view-toggle__btn");
    expect(wrapper.find(".fs-layout").classes()).toContain("fs-layout--list");
    expect(listBtn!.attributes("aria-pressed")).toBe("true");

    await mapBtn!.trigger("click");
    await flushPromises();
    expect(wrapper.find(".fs-layout").classes()).toContain("fs-layout--map");
    expect(mapBtn!.attributes("aria-pressed")).toBe("true");
  });
});

describe("FindSpecialistView — map (NEO-79)", () => {
  beforeEach(() => {
    loadGoogleMaps.mockResolvedValue(fakeLibraries);
    fetchMock.mockResolvedValue(jsonResponse({ specialists: SPECIALISTS }));
  });

  it("places one Advanced Marker per clinic in the clusterer, on a map with a Map ID", async () => {
    await mountView();

    expect(fakeMaps).toHaveLength(1);
    expect(fakeMarkers.map((m) => m.options.title)).toEqual(["Clínica Dental Roma Norte", "Instituto del Sueño Del Valle"]);
    expect(clusterer.addMarkers).toHaveBeenLastCalledWith(fakeMarkers);
  });

  it("selecting a card pans the map to its pin and highlights both", async () => {
    const wrapper = await mountView();

    await wrapper.findAll(".fs-card__select")[1]!.trigger("click");

    expect(fakeMaps[0]!.panTo).toHaveBeenCalledWith({ lat: 19.3857, lng: -99.1633 });
    expect(wrapper.findAll(".fs-card")[1]!.classes()).toContain("fs-card--active");
    expect(fakeMarkers[1]!.zIndex).toBe(3000);
  });

  it("clicking a pin selects its card and scrolls it into view", async () => {
    const wrapper = await mountView();

    fakeMarkers[0]!.listeners.get("gmp-click")!();
    await flushPromises();

    const card = wrapper.find('[data-specialist-id="org-1"]');
    expect(card.classes()).toContain("fs-card--active");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // The phone map-mode card shows the same clinic.
    expect(wrapper.find(".fs-map-card").text()).toContain("Clínica Dental Roma Norte");
  });

  it("filtering re-renders the pins to match the list", async () => {
    const wrapper = await mountView();
    fakeMarkers.length = 0;

    await wrapper.find("#fs-search-input").setValue("dentista");

    expect(fakeMarkers.map((m) => m.options.title)).toEqual(["Clínica Dental Roma Norte"]);
  });
});
