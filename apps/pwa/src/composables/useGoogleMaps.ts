declare global {
  interface Window {
    google: typeof google;
  }
}

const SCRIPT_ID = "google-maps-js-api";

let loadPromise: Promise<typeof google> | null = null;

/**
 * Lazily injects the Google Maps JavaScript API `<script>` tag once (cached
 * across every caller) and resolves once `window.google.maps` is ready.
 * Same browser-key integration as apps/web/src/composables/useGoogleMaps.ts
 * (that one powers the public "find a specialist" map) — duplicated rather
 * than shared across the two separate Vite apps, since it's ~60 lines with
 * no other dependencies and this repo has no shared non-Vue-specific package
 * for either app to pull it from. VITE_GOOGLE_MAPS_BROWSER_API_KEY is loaded
 * from the repo-root .env (envDir in vite.shared.ts), same key both apps use.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadGoogleMaps can only run in the browser"));
      return;
    }
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY as string | undefined;
    if (!apiKey) {
      reject(new Error("VITE_GOOGLE_MAPS_BROWSER_API_KEY is not configured"));
      return;
    }

    // A script tag that already errored out won't fire onload/onerror again —
    // drop it so a retry actually re-requests the script instead of hanging forever.
    document.getElementById(SCRIPT_ID)?.remove();

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  // A failed load must not stay cached forever — the next call (e.g. a user
  // clicking "Try again") should get a fresh attempt, not the same rejection.
  loadPromise.catch(() => {
    // benign: only resets the cache; the caller awaiting loadPromise handles and reports the rejection.
    loadPromise = null;
  });

  return loadPromise;
}

/**
 * Hides the default POI/business/transit clutter so the map reads as just
 * streets + our own pin — see google.maps.MapOptions.styles.
 */
export const CLEAN_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];
