import { ref, onBeforeUnmount, type Ref } from "vue";
import type { MarkerClusterer } from "@googlemaps/markerclusterer";
import { reportCaught } from "@api";
import { loadGoogleMaps, googleMapId, onGoogleMapsAuthFailure, type GoogleMapsLibraries } from "./useGoogleMaps";
import type { Specialist } from "../utils/specialists";

/**
 * The Google map half of the find-a-specialist page (NEO-79): one
 * AdvancedMarkerElement per clinic, grouped by @googlemaps/markerclusterer
 * when zoomed out, and a selected pin that mirrors the selected list card.
 *
 * Owns its own loading/error state on purpose — a map failure (bad key,
 * blocked script, referrer not allowed) must never hide the clinic list,
 * which is the accessible equivalent of the map and works without it.
 */

/** Default center/zoom before any results arrive — matches the active market for each site locale. */
const LOCALE_MAP_VIEW: Record<string, { center: google.maps.LatLngLiteral; zoom: number }> = {
  mx: { center: { lat: 23.6345, lng: -102.5528 }, zoom: 5 }, // Mexico
  pl: { center: { lat: 52.0, lng: 19.5 }, zoom: 6 }, // Poland
  en: { center: { lat: 54, lng: 15 }, zoom: 4 }, // Europe
};

/** Zoom used when focusing one clinic (street level, still shows the neighbourhood). */
const FOCUS_ZOOM = 14;

// Static markup only (no data interpolated), so innerHTML is safe here.
const PIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.5 2C4.9 2 3 4.1 3 6.9c0 2 .7 3.4 1.2 5 .6 2 .8 4.2 1.4 6.3.4 1.6 1 3.3 2.2 3.3 1.5 0 1.6-2.5 2-4.3.3-1.4.8-2.7 2.2-2.7s1.9 1.3 2.2 2.7c.4 1.8.5 4.3 2 4.3 1.2 0 1.8-1.7 2.2-3.3.6-2.1.8-4.3 1.4-6.3.5-1.6 1.2-3 1.2-5C21 4.1 19.1 2 16.5 2c-1.9 0-2.8 1-4.5 1S9.4 2 7.5 2Z"/></svg>';

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "fs-pin";
  el.innerHTML = `<span class="fs-pin__head">${PIN_SVG}</span>`;
  return el;
}

function clusterElement(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "fs-cluster";
  const inner = document.createElement("span");
  inner.className = "fs-cluster__count";
  inner.textContent = String(count);
  el.appendChild(inner);
  return el;
}

interface PlacedMarker {
  marker: google.maps.marker.AdvancedMarkerElement;
  element: HTMLElement;
  position: google.maps.LatLngLiteral;
}

export interface UseSpecialistMapOptions {
  container: Ref<HTMLElement | null>;
  locale: Ref<string>;
  /** A pin was clicked / activated with the keyboard. */
  onSelect: (id: string) => void;
  /** Accessible name for a cluster bubble ("3 specialists in this area"). */
  clusterTitle: (count: number) => string;
}

export function useSpecialistMap(options: UseSpecialistMapOptions) {
  const mapLoading = ref(false);
  const mapError = ref(false);

  let libs: GoogleMapsLibraries | null = null;
  let map: google.maps.Map | null = null;
  let clusterer: MarkerClusterer | null = null;
  const placed = new Map<string, PlacedMarker>();
  let selectedId: string | null = null;
  let lastResults: Specialist[] = [];

  const stopAuthListener = onGoogleMapsAuthFailure(() => {
    reportCaught(new Error("Google Maps rejected the browser API key (gm_authFailure)"), {
      where: "web.FindSpecialistView.loadMap",
      level: "warn",
      extra: { reason: "auth_failure" },
    });
    mapError.value = true;
  });
  onBeforeUnmount(() => {
    stopAuthListener();
    clusterer?.clearMarkers();
  });

  async function ensureMap(): Promise<boolean> {
    if (map) return true;
    if (!options.container.value) return false;
    mapLoading.value = true;
    mapError.value = false;
    try {
      libs = await loadGoogleMaps();
      const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
      if (!options.container.value) return false;
      const initialView = LOCALE_MAP_VIEW[options.locale.value] ?? LOCALE_MAP_VIEW.en!;
      map = new libs.Map(options.container.value, {
        mapId: googleMapId(),
        center: initialView.center,
        zoom: initialView.zoom,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: "auto",
      });
      const { AdvancedMarkerElement } = libs;
      clusterer = new MarkerClusterer({
        map,
        renderer: {
          render: ({ count, position }) =>
            new AdvancedMarkerElement({
              position,
              content: clusterElement(count),
              title: options.clusterTitle(count),
              zIndex: 1000 + count,
            }),
        },
      });
      render(lastResults);
      return true;
    } catch (err) {
      // Degraded, not broken: the list still works without the map.
      reportCaught(err, { where: "web.FindSpecialistView.loadMap", level: "warn" });
      map = null;
      mapError.value = true;
      return false;
    } finally {
      mapLoading.value = false;
    }
  }

  function applySelection() {
    for (const [id, { marker, element }] of placed) {
      const active = id === selectedId;
      element.classList.toggle("fs-pin--active", active);
      marker.zIndex = active ? 3000 : null;
    }
  }

  /** Fits the map to every shown clinic (one clinic → centered at street level). */
  function fit() {
    if (!map || !libs || lastResults.length === 0) return;
    if (lastResults.length === 1) {
      const only = lastResults[0]!;
      map.setCenter({ lat: only.latitude, lng: only.longitude });
      map.setZoom(FOCUS_ZOOM);
      return;
    }
    const bounds = new libs.LatLngBounds();
    for (const s of lastResults) bounds.extend({ lat: s.latitude, lng: s.longitude });
    map.fitBounds(bounds, 56);
  }

  /** Replaces the pins with `results` (the currently filtered list) and fits the view to them. */
  function render(results: Specialist[]) {
    lastResults = results;
    if (!map || !libs || !clusterer) return;
    clusterer.clearMarkers(true);
    placed.clear();

    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    for (const specialist of results) {
      const element = pinElement();
      const position = { lat: specialist.latitude, lng: specialist.longitude };
      const marker = new libs.AdvancedMarkerElement({
        position,
        content: element,
        title: specialist.name,
        gmpClickable: true,
      });
      // gmp-click fires for a pointer click and for Enter/Space on the focused pin.
      marker.addEventListener("gmp-click", () => options.onSelect(specialist.id));
      placed.set(specialist.id, { marker, element, position });
      markers.push(marker);
    }
    clusterer.addMarkers(markers);
    applySelection();
    fit();
  }

  /** Highlights `id`'s pin; with `pan`, brings it into view close enough to break its cluster apart. */
  function select(id: string | null, { pan = false }: { pan?: boolean } = {}) {
    selectedId = id;
    applySelection();
    if (!pan || !map || !id) return;
    const entry = placed.get(id);
    if (!entry) return;
    map.panTo(entry.position);
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
  }

  return { mapLoading, mapError, ensureMap, render, select, fit };
}
