import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";

/**
 * NEO-81 — the find-a-specialist page must never fail silently again:
 *   - a Google Maps failure no longer hides the clinic list (it used to be
 *     merged into one "couldn't load specialists" state), and
 *   - a failed specialists request says *why* (connection vs. our side) and
 *     leaves a console line + a diagnostics report.
 * The map redesign itself is NEO-79; this only pins the error handling.
 */

const loadGoogleMaps = vi.fn<() => Promise<typeof google>>();
vi.mock("../composables/useGoogleMaps", () => ({
  loadGoogleMaps: () => loadGoogleMaps(),
  CLEAN_MAP_STYLES: [],
}));
vi.mock("../composables/useSeoMeta", () => ({ useSeoMeta: () => undefined }));
vi.mock("../composables/useReveal", async () => {
  const { ref } = await import("vue");
  return { useReveal: () => ref(true) };
});

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
];

/** Let the view's two retry delays (1.5 s, 3 s) elapse, settling each attempt in between. */
async function runRetries() {
  for (let i = 0; i < 3; i++) {
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
  }
}

async function mountView() {
  const { default: FindSpecialistView } = await import("./FindSpecialistView.vue");
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { template: "<div/>" } }, { path: "/contact", component: { template: "<div/>" } }] });
  await router.push("/");
  await router.isReady();
  const wrapper = mount(FindSpecialistView, { global: { plugins: [i18n, router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  // Only setTimeout is faked (the view's retry delays); setImmediate stays real so
  // flushPromises() keeps working — deterministic even on a loaded CI box.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockReset();
  loadGoogleMaps.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FindSpecialistView — error handling (NEO-81)", () => {
  it("a Maps failure keeps the clinic list and says only the map is unavailable", async () => {
    loadGoogleMaps.mockRejectedValue(new Error("VITE_GOOGLE_MAPS_BROWSER_API_KEY is not configured"));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ specialists: SPECIALISTS }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

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
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests, please try again later" }), { status: 429, headers: { "Content-Type": "application/json" } }),
    );

    const wrapper = await mountView();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(en["common.error.rateLimited.title"]);
  });
});
