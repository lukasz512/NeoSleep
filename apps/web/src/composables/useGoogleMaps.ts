declare global {
  interface Window {
    google: typeof google;
    /** Bootstrap callback named in the script URL — see loadGoogleMaps(). */
    __neoGoogleMapsReady?: () => void;
    /** Google calls this when the key is rejected (bad key, referrer not allowed, billing off). */
    gm_authFailure?: () => void;
  }
}

const SCRIPT_ID = "google-maps-js-api";
const READY_CALLBACK = "__neoGoogleMapsReady";

/**
 * Google's documented Map ID for trying Advanced Markers without creating one
 * (https://developers.google.com/maps/documentation/javascript/advanced-markers/start).
 * AdvancedMarkerElement refuses to render on a map without a Map ID, so this
 * keeps the map working until a real one is configured — but it is meant for
 * development: it cannot be styled (so the default POI labels show) and
 * Google may change it. Set VITE_GOOGLE_MAPS_MAP_ID (a Map ID created in the
 * Cloud Console under Google Maps Platform → Map management, type
 * JavaScript / Vector) for dev/prod builds.
 */
export const FALLBACK_MAP_ID = "DEMO_MAP_ID";

/** The Map ID for this build, or Google's demo one (see FALLBACK_MAP_ID). */
export function googleMapId(): string {
  const configured = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim();
  return configured || FALLBACK_MAP_ID;
}

/** The pieces of the Maps SDK the find-a-specialist page uses. */
export interface GoogleMapsLibraries {
  Map: typeof google.maps.Map;
  LatLngBounds: typeof google.maps.LatLngBounds;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
}

let loadPromise: Promise<GoogleMapsLibraries> | null = null;
const authFailureListeners = new Set<() => void>();

/**
 * Runs `listener` when Google rejects the key after the script has loaded
 * (the map then shows Google's own "This page can't load Google Maps
 * correctly" box instead of failing the load). Returns an unsubscribe.
 */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

function injectBootstrapScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // A script tag that already errored out won't fire onload/onerror again —
    // drop it so a retry actually re-requests the script instead of hanging forever.
    document.getElementById(SCRIPT_ID)?.remove();

    window[READY_CALLBACK] = () => resolve();
    window.gm_authFailure = () => authFailureListeners.forEach((listener) => listener());

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    // loading=async + a callback is Google's recommended bootstrap: the
    // callback fires once google.maps.importLibrary exists. (The previous
    // loader resolved on the script's onload and then called
    // `new google.maps.Map` directly — with loading=async that constructor
    // doesn't exist yet, so the map never rendered.)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${READY_CALLBACK}`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });
}

/**
 * Lazily loads the Google Maps JavaScript API once (cached across callers)
 * and resolves with the libraries the find-a-specialist map needs. Public
 * and unauthenticated: it uses a separate HTTP-referrer-restricted browser
 * key, not the server-side geocoding key (apps/api/src/services/geocoding.ts).
 */
export function loadGoogleMaps(): Promise<GoogleMapsLibraries> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof window === "undefined") throw new Error("loadGoogleMaps can only run in the browser");

    if (!window.google?.maps?.importLibrary) {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY as string | undefined;
      if (!apiKey) throw new Error("VITE_GOOGLE_MAPS_BROWSER_API_KEY is not configured");
      await injectBootstrapScript(apiKey);
    }

    const [maps, core, marker] = await Promise.all([
      google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
      google.maps.importLibrary("core") as Promise<google.maps.CoreLibrary>,
      google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
    ]);
    return { Map: maps.Map, LatLngBounds: core.LatLngBounds, AdvancedMarkerElement: marker.AdvancedMarkerElement };
  })();

  // A failed load must not stay cached forever — the next call (e.g. a user
  // clicking "Try again") should get a fresh attempt, not the same rejection.
  loadPromise.catch(() => {
    // benign: only resets the cache; the caller awaiting loadPromise reports the rejection.
    loadPromise = null;
  });

  return loadPromise;
}
