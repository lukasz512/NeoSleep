<template>
  <div class="view-find-specialist">

    <!-- ── Search Hero ────────────────────────────────────────────────────── -->
    <section class="fs-hero home-section page-container">
      <p class="home-eyebrow">{{ t("website.findSpecialist.eyebrow") }}</p>
      <h1 class="fs-hero__tagline">
        <span class="fs-hero__tagline-l1">{{ t("website.findSpecialist.heroTagline1") }}</span>
        <span class="fs-hero__tagline-l2">{{ t("website.findSpecialist.heroTagline2") }}</span>
      </h1>
      <p class="fs-hero__sub">{{ t("website.findSpecialist.heroSub") }}</p>
      <form class="fs-search" @submit.prevent="runSearch">
        <div class="fs-search__field">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('website.findSpecialist.searchPlaceholder')"
            class="fs-search__input"
            :class="{ 'fs-search__input--loading': dataLoading }"
            :disabled="dataLoading"
          />
          <button
            v-if="searchQuery && !dataLoading"
            type="button"
            class="fs-search__clear"
            :aria-label="t('website.findSpecialist.clearSearch')"
            @click="clearSearch"
          >
            ✕
          </button>
        </div>
        <button type="submit" class="home-btn home-btn--primary fs-search__submit" :disabled="dataLoading">
          {{ dataLoading ? t("website.findSpecialist.searching") : t("website.findSpecialist.searchBtn") }}
        </button>
      </form>
    </section>

    <!-- ── Map ───────────────────────────────────────────────────────────── -->
    <div class="fs-map-outer page-container">
      <div class="fs-map-wrap" :class="{ 'fs-map-wrap--loading': isPending }">
        <span v-if="isPending" class="fs-sr-only" role="status">{{ t("website.findSpecialist.loading") }}</span>
        <div ref="mapContainer" class="fs-map" :title="t('website.findSpecialist.mapTitle')" />
        <div v-if="hasError" class="fs-map__overlay">
          <p class="fs-map__error-text">{{ t("website.findSpecialist.loadError") }}</p>
          <button type="button" class="fs-map__retry" @click="retry">{{ t("website.findSpecialist.retry") }}</button>
        </div>
      </div>
    </div>

    <!-- ── Specialist directory ──────────────────────────────────────────── -->
    <section class="home-section fs-results page-container">
      <h2 class="home-heading">{{ t("website.findSpecialist.nearbyTitle") }}</h2>
      <p class="fs-results__note">{{ t("website.findSpecialist.networkNote") }}</p>

      <div v-if="!isPending && !hasError" class="fs-network-grid">

        <!-- Results -->
        <article
          v-for="specialist in specialists"
          :key="specialist.id"
          class="fs-card"
          :class="{ 'fs-card--active': selectedId === specialist.id }"
          @mouseenter="focusSpecialist(specialist.id)"
        >
          <h3 class="fs-card__title">{{ specialist.name }}</h3>
          <p class="fs-card__address">{{ [specialist.address_line1, specialist.city, specialist.state].filter(Boolean).join(", ") }}</p>
          <p v-if="specialist.phone" class="fs-card__phone">{{ specialist.phone }}</p>
          <p v-if="specialist.practitioners.length > 0" class="fs-card__doctors">
            {{ t("website.findSpecialist.doctorsLabel") }} {{ specialist.practitioners.map((p) => p.name).join(", ") }}
          </p>
          <a :href="mapLinkFor(specialist)" target="_blank" rel="noopener" class="fs-card__link">
            {{ t("website.findSpecialist.viewOnMap") }} →
          </a>
        </article>

        <!-- Empty state — only when a real search returned nothing -->
        <div v-if="specialists.length === 0" class="fs-network-empty">
          <div class="fs-network-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p class="fs-network-empty__title">{{ t("website.findSpecialist.network.emptyTitle") }}</p>
          <p class="fs-network-empty__desc">{{ t("website.findSpecialist.network.emptyDesc") }}</p>
        </div>

        <!-- Partner callout -->
        <div class="fs-network-partner">
          <div class="fs-network-partner__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <h3 class="fs-network-partner__title">{{ t("website.findSpecialist.network.partnerTitle") }}</h3>
          <p class="fs-network-partner__desc">{{ t("website.findSpecialist.network.partnerDesc") }}</p>
          <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="fs-network-partner__link">
            {{ t("website.findSpecialist.network.partnerCta") }} →
          </RouterLink>
        </div>

      </div>
    </section>

    <!-- ── CTA ────────────────────────────────────────────────────────────── -->
    <div
      ref="ctaRef"
      class="fs-cta-wrap home-reveal"
      :class="{ 'home-reveal--visible': ctaVisible }"
    >
      <div class="page-container">
        <div class="fs-cta">
          <h2 class="fs-cta__heading">{{ t("website.findSpecialist.cta.heading") }}</h2>
          <p class="fs-cta__sub">{{ t("website.findSpecialist.cta.sub") }}</p>
          <div class="fs-cta__btns">
            <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="home-btn home-btn--white-outline">
              {{ t("website.findSpecialist.cta.btn") }}
              <span class="home-btn__arrow" aria-hidden="true">→</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useReveal } from "../composables/useReveal";
import { useSeoMeta } from "../composables/useSeoMeta";
import { loadGoogleMaps, CLEAN_MAP_STYLES } from "../composables/useGoogleMaps";
import { apiFetch } from "../utils/api";

const { t, locale } = useI18n();

/** Default map center/zoom before any results arrive (fitBounds takes over once there are pins) — matches the active market for each site locale. */
const LOCALE_MAP_VIEW: Record<string, { center: google.maps.LatLngLiteral; zoom: number }> = {
  mx: { center: { lat: 23.6345, lng: -102.5528 }, zoom: 5 }, // Mexico
  pl: { center: { lat: 52.0, lng: 19.5 }, zoom: 6 }, // Poland
  en: { center: { lat: 54, lng: 15 }, zoom: 4 }, // Europe
};
useSeoMeta({ titleKey: "website.seo.findSpecialist.title", descriptionKey: "website.seo.findSpecialist.description" });

interface Practitioner {
  id: string;
  name: string;
  specialties: string[];
}

interface Specialist {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  phone: string | null;
  website: string | null;
  google_link: string | null;
  specialties: string[];
  latitude: number;
  longitude: number;
  practitioners: Practitioner[];
}

const searchQuery = ref("");
const specialists = ref<Specialist[]>([]);
const dataLoading = ref(true);
const dataError = ref(false);
const selectedId = ref<string | null>(null);

// Single pending/error surface driving the map-area overlay — either the
// specialists fetch or the Maps SDK itself can fail independently, but the
// user just needs one clear "still loading" / "something's wrong" state.
const isPending = computed(() => dataLoading.value || mapLoading.value);
const hasError = computed(() => !isPending.value && (dataError.value || mapError.value));

function mapLinkFor(specialist: Specialist): string {
  if (specialist.google_link) return specialist.google_link;
  return `https://www.google.com/maps/search/?api=1&query=${specialist.latitude},${specialist.longitude}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Map ──────────────────────────────────────────────────────────────────
const mapContainer = ref<HTMLElement | null>(null);
const mapLoading = ref(true);
const mapError = ref(false);
let map: google.maps.Map | null = null;
let markers: google.maps.Marker[] = [];
let infoWindow: google.maps.InfoWindow | null = null;

async function ensureMap(): Promise<google.maps.Map | null> {
  if (map) return map;
  if (!mapContainer.value) return null;
  mapLoading.value = true;
  mapError.value = false;
  try {
    const g = await loadGoogleMaps();
    const initialView = LOCALE_MAP_VIEW[locale.value] ?? LOCALE_MAP_VIEW.en!;
    map = new g.maps.Map(mapContainer.value, {
      center: initialView.center,
      zoom: initialView.zoom,
      styles: CLEAN_MAP_STYLES,
      streetViewControl: false,
      mapTypeControl: false,
    });
    infoWindow = new g.maps.InfoWindow();
    return map;
  } catch {
    mapError.value = true;
    return null;
  } finally {
    mapLoading.value = false;
  }
}

function renderMarkers(results: Specialist[]) {
  if (!map) return;
  markers.forEach((m) => m.setMap(null));
  markers = [];
  if (results.length === 0) return;

  const bounds = new google.maps.LatLngBounds();
  for (const specialist of results) {
    const position = { lat: specialist.latitude, lng: specialist.longitude };
    const marker = new google.maps.Marker({ position, map, title: specialist.name });
    marker.addListener("click", () => {
      selectedId.value = specialist.id;
      const doctors = specialist.practitioners.length
        ? `<div class="fs-infowindow__doctors">${escapeHtml(t("website.findSpecialist.doctorsLabel"))} ${escapeHtml(specialist.practitioners.map((p) => p.name).join(", "))}</div>`
        : "";
      infoWindow?.setContent(
        `<div class="fs-infowindow">
           <strong>${escapeHtml(specialist.name)}</strong>
           <div>${escapeHtml([specialist.address_line1, specialist.city].filter(Boolean).join(", "))}</div>
           ${specialist.phone ? `<div>${escapeHtml(specialist.phone)}</div>` : ""}
           ${doctors}
         </div>`
      );
      infoWindow?.open(map!, marker);
    });
    markers.push(marker);
    bounds.extend(position);
  }
  map.fitBounds(bounds, 48);
}

function focusSpecialist(id: string) {
  selectedId.value = id;
}

// ── Search ───────────────────────────────────────────────────────────────
// The specialists fetch and the Maps SDK load are independent failure modes
// (a slow/broken API vs. a bad Maps key) — run them concurrently so one
// failing doesn't block the other from ever being attempted, and each
// updates its own loading/error state (surfaced together via isPending/hasError).

// A couple of silent retries before surfacing an error — the API can
// genuinely still be waking up on the very first request (Render's free
// tier cold-starts after inactivity; the same thing shows up locally if the
// dev API is still finishing its DB connection when the page loads).
const FETCH_RETRY_DELAYS_MS = [1500, 3000];

async function fetchSpecialists() {
  dataLoading.value = true;
  dataError.value = false;
  const query = searchQuery.value.trim();
  const url = `/api/v1/public/specialists${query ? `?search=${encodeURIComponent(query)}` : ""}`;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { specialists: Specialist[] };
      specialists.value = data.specialists;
      dataLoading.value = false;
      return;
    } catch {
      const delay = FETCH_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        dataError.value = true;
        dataLoading.value = false;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function runSearch() {
  await fetchSpecialists();
  await nextTick();
  const m = await ensureMap();
  if (m) renderMarkers(specialists.value);
}

function clearSearch() {
  searchQuery.value = "";
  void runSearch();
}

async function retry() {
  await Promise.all([fetchSpecialists(), ensureMap()]);
  await nextTick();
  if (map) renderMarkers(specialists.value);
}

onMounted(async () => {
  await Promise.all([fetchSpecialists(), ensureMap()]);
  if (map) renderMarkers(specialists.value);
});

const ctaRef = ref<HTMLElement | null>(null);
const ctaVisible = useReveal(ctaRef, 0.10);
</script>

<style lang="scss">
@layer components {
  /* ── Search Hero ─────────────────────────────────────────────────────── */
  .fs-hero {
    text-align: center;
  }

  .fs-hero__tagline {
    display: flex;
    flex-direction: column;
    gap: 0.06em;
    font-size: clamp(2.5rem, 6vw, 4rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
    margin: 0 auto 1.25rem;
    max-width: 820px;
  }

  .fs-hero__tagline-l1 { color: var(--website-text); }
  .fs-hero__tagline-l2 { color: var(--website-primary); }

  .fs-hero__sub {
    font-size: clamp(1rem, 2vw, 1.125rem);
    line-height: 1.72;
    color: var(--website-text-secondary);
    max-width: 600px;
    margin: 0 auto;
  }

  /* ── Search form ─────────────────────────────────────────────────────── */
  .fs-search {
    display: flex;
    gap: 0.75rem;
    max-width: 560px;
    margin: 2rem auto 0;
  }

  .fs-search__field {
    position: relative;
    flex: 1;
  }

  .fs-search__input {
    width: 100%;
    height: 52px;
    border: 1.5px solid var(--website-border);
    border-radius: 9999px;
    padding: 0 2.75rem 0 1.5rem;
    font-size: 1rem;
    background: var(--website-bg);
    color: var(--website-text);
    outline: none;
    transition: border-color 0.2s;

    &:focus {
      border-color: var(--website-primary);
    }

    &::placeholder {
      color: var(--website-text-secondary);
      opacity: 0.65;
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  .fs-search__clear {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--website-text-secondary);
    cursor: pointer;
    font-size: 0.875rem;

    &:hover {
      background: rgba(0, 0, 0, 0.06);
      color: var(--website-text);
    }
  }

  .fs-search__submit {
    flex-shrink: 0;
  }

  .fs-search__input--loading {
    animation: fs-border-pulse 1.2s ease-in-out infinite;
  }

  /* ── Map ─────────────────────────────────────────────────────────────── */
  .fs-map-outer {
    margin-top: 1.5rem;
  }

  .fs-map-wrap {
    position: relative;
    width: 100%;
    height: 480px;
    border-radius: var(--website-card-radius);
    overflow: hidden;
    // A visible silhouette even before the map paints anything — the area
    // should always read as "this is where the map is," never as blank
    // whitespace indistinguishable from the rest of the page. Plain neutral
    // grey — not a brand-tinted color, so it doesn't read as "success".
    background: #e5e7eb;
    border-bottom: 3px solid transparent;
    transition: border-bottom-color 0.3s ease;

    [data-theme="dark"] & {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  .fs-map-wrap--loading {
    animation: fs-border-pulse 1.2s ease-in-out infinite;
  }

  @keyframes fs-border-pulse {
    0%, 100% { border-bottom-color: var(--website-primary); }
    50% { border-bottom-color: transparent; }
  }

  .fs-map {
    width: 100%;
    height: 100%;
  }

  .fs-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .fs-map__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .fs-map__error-text {
    margin: 0;
    color: var(--website-text-secondary);
    font-size: 0.9375rem;
  }

  .fs-map__retry {
    color: var(--website-primary);
    background: none;
    border: 1.5px solid var(--website-primary);
    border-radius: 9999px;
    padding: 0.5rem 1.5rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover {
      background: var(--website-primary);
      color: #fff;
    }
  }

  .fs-infowindow {
    font-family: inherit;
    font-size: 0.875rem;
    line-height: 1.5;
    max-width: 220px;
  }

  .fs-infowindow__doctors {
    margin-top: 0.35rem;
    color: #5f6b66;
  }

  /* ── Specialist directory ────────────────────────────────────────────── */
  .fs-results {
    text-align: left;
  }

  .fs-results__note {
    font-size: 0.875rem;
    color: var(--website-text-secondary);
    margin: 0.5rem 0 0;
  }

  .fs-network-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.75rem;
  }

  .fs-card {
    flex: 1 1 280px;
    max-width: 360px;
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
    padding: 1.75rem;
    transition: box-shadow 0.2s, transform 0.2s;

    &--active,
    &:hover {
      box-shadow: var(--website-shadow-md);
      transform: translateY(-2px);
    }
  }

  .fs-card__title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.5rem;
  }

  .fs-card__address,
  .fs-card__phone {
    font-size: 0.9375rem;
    color: var(--website-text-secondary);
    margin: 0 0 0.25rem;
  }

  .fs-card__doctors {
    font-size: 0.875rem;
    color: var(--website-text-secondary);
    margin: 0.5rem 0 0;
  }

  .fs-card__link {
    display: inline-block;
    margin-top: 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-primary);
    text-decoration: none;

    &:hover { text-decoration: underline; }
  }

  .fs-network-partner {
    flex: 1 1 280px;
    max-width: 420px;
  }

  .fs-network-empty {
    // Full-width — there's plenty of room here, no reason to cramp the
    // "no results" message into a card the same size as a result tile.
    flex: 1 1 100%;
    max-width: none;
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
    padding: 3.5rem 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
  }

  .fs-network-empty__icon {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--website-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.25rem;

    svg { width: 24px; height: 24px; color: var(--website-primary); }
  }

  .fs-network-empty__title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0;
  }

  .fs-network-empty__desc {
    font-size: 0.9375rem;
    line-height: 1.65;
    color: var(--website-text-secondary);
    margin: 0;
    max-width: 320px;
  }

  .fs-network-partner {
    border: 1px dashed var(--website-footer-card-border);
    border-radius: var(--website-card-radius);
    padding: 2.5rem 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
    transition: transform 0.2s;

    &:hover { transform: translateY(-2px); }
  }

  .fs-network-partner__icon {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--website-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.25rem;

    svg { width: 24px; height: 24px; color: var(--website-primary); }
  }

  .fs-network-partner__title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--website-text-secondary);
    margin: 0;
  }

  .fs-network-partner__desc {
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--website-text-secondary);
    margin: 0;
    max-width: 260px;
  }

  .fs-network-partner__link {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-primary);
    text-decoration: none;
    margin-top: 0.25rem;

    &:hover { text-decoration: underline; }
  }

  /* ── CTA ─────────────────────────────────────────────────────────────── */
  .fs-cta-wrap {
    padding-bottom: 2.5rem;
  }

  .fs-cta {
    background: linear-gradient(135deg, var(--neosleep-very-dark-teal) 0%, var(--neosleep-darker-teal) 100%);
    border-radius: var(--website-card-radius);
    padding: 4.5rem 2rem;
    text-align: center;
  }

  .fs-cta__heading {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 700;
    color: #fff;
    margin: 0 0 0.625rem;
    letter-spacing: -0.025em;
  }

  .fs-cta__sub {
    font-size: 1.0625rem;
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.78);
    max-width: 560px;
    margin: 0 auto 2.25rem;
  }

  .fs-cta__btns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.875rem;
    justify-content: center;
  }
}
</style>
