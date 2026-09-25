<template>
  <div class="view-find-specialist">

    <section class="fs-hero home-section page-container">
      <p class="home-eyebrow">{{ t("website.findSpecialist.eyebrow") }}</p>
      <h1 class="fs-hero__tagline">
        <span class="fs-hero__tagline-l1">{{ t("website.findSpecialist.heroTagline1") }}</span>
        <span class="fs-hero__tagline-l2">{{ t("website.findSpecialist.heroTagline2") }}</span>
      </h1>
      <p class="fs-hero__sub">{{ t("website.findSpecialist.heroSub") }}</p>

      <div class="fs-search" role="search">
        <label class="fs-sr-only" for="fs-search-input">{{ t("website.findSpecialist.searchLabel") }}</label>
        <div class="fs-search__field">
          <svg class="fs-search__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></g></svg>
          <input
            id="fs-search-input"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            enterkeyhint="search"
            :placeholder="t('website.findSpecialist.searchPlaceholder')"
            class="fs-search__input"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="fs-search__clear"
            :aria-label="t('website.findSpecialist.clearSearch')"
            @click="clearSearch"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <div v-if="chips.length > 1" class="fs-chips" role="group" :aria-label="t('website.findSpecialist.filtersLabel')">
        <button
          type="button"
          class="fs-chip"
          :class="{ 'fs-chip--on': activeSpecialty === null }"
          :aria-pressed="activeSpecialty === null"
          @click="activeSpecialty = null"
        >
          {{ t("website.findSpecialist.filterAll") }}
        </button>
        <button
          v-for="code in chips"
          :key="code"
          type="button"
          class="fs-chip"
          :class="{ 'fs-chip--on': activeSpecialty === code }"
          :aria-pressed="activeSpecialty === code"
          @click="activeSpecialty = activeSpecialty === code ? null : code"
        >
          {{ t(specialtyLabelKey(code)) }}
        </button>
      </div>
    </section>

    <section class="fs-results page-container" aria-labelledby="fs-results-title">
      <h2 id="fs-results-title" class="fs-sr-only">{{ t("website.findSpecialist.nearbyTitle") }}</h2>

      <div class="fs-results__bar">
        <p class="fs-results__count" aria-live="polite">
          <template v-if="!dataLoading && !dataFailureText">{{ t("website.findSpecialist.resultCount", { count: filtered.length }) }}</template>
        </p>
        <div class="fs-view-toggle" role="group" :aria-label="t('website.findSpecialist.viewToggleLabel')">
          <button
            type="button"
            class="fs-view-toggle__btn"
            :class="{ 'fs-view-toggle__btn--on': view === 'list' }"
            :aria-pressed="view === 'list'"
            @click="setView('list')"
          >
            {{ t("website.findSpecialist.viewList") }}
          </button>
          <button
            type="button"
            class="fs-view-toggle__btn"
            :class="{ 'fs-view-toggle__btn--on': view === 'map' }"
            :aria-pressed="view === 'map'"
            @click="setView('map')"
          >
            {{ t("website.findSpecialist.viewMap") }}
          </button>
        </div>
      </div>

      <div class="fs-layout" :class="`fs-layout--${view}`">
        <div ref="listRef" class="fs-layout__list">

          <!-- Loading -->
          <template v-if="dataLoading">
            <span class="fs-sr-only" role="status">{{ t("website.findSpecialist.loading") }}</span>
            <div v-for="n in 3" :key="n" class="fs-card fs-card--skeleton" aria-hidden="true">
              <span class="fs-skel fs-skel--tag" />
              <span class="fs-skel fs-skel--title" />
              <span class="fs-skel fs-skel--line" />
              <span class="fs-skel fs-skel--actions" />
            </div>
          </template>

          <!-- Error: the message depends on why it failed (NEO-81) -->
          <div v-else-if="dataFailureText" class="fs-state" role="alert">
            <div class="fs-state__icon fs-state__icon--error" aria-hidden="true">
              <svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></g></svg>
            </div>
            <p class="fs-state__title">{{ dataFailureText.title }}</p>
            <p class="fs-state__desc">{{ t("website.findSpecialist.loadError") }} {{ dataFailureText.body }}</p>
            <p v-if="dataFailureText.reference" class="fs-state__ref">{{ dataFailureText.reference }}</p>
            <button type="button" class="fs-state__btn" @click="retry">{{ t("website.findSpecialist.retry") }}</button>
          </div>

          <!-- Nothing in the directory at all -->
          <div v-else-if="specialists.length === 0" class="fs-state">
            <div class="fs-state__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></g></svg>
            </div>
            <p class="fs-state__title">{{ t("website.findSpecialist.network.emptyTitle") }}</p>
            <p class="fs-state__desc">{{ t("website.findSpecialist.network.emptyDesc") }}</p>
            <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="fs-state__btn fs-state__btn--primary">
              {{ t("website.findSpecialist.notifyMe") }}
            </RouterLink>
          </div>

          <!-- The search / chip matched nothing -->
          <div v-else-if="filtered.length === 0" class="fs-state">
            <div class="fs-state__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></g></svg>
            </div>
            <p class="fs-state__title">{{ t("website.findSpecialist.noMatchTitle", { query: searchQuery.trim() || chipLabel }) }}</p>
            <p class="fs-state__desc">{{ t("website.findSpecialist.noMatchDesc") }}</p>
            <div class="fs-state__actions">
              <button type="button" class="fs-state__btn" @click="clearFilters">{{ t("website.findSpecialist.clearSearch") }}</button>
              <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="fs-state__btn fs-state__btn--primary">
                {{ t("website.findSpecialist.notifyMe") }}
              </RouterLink>
            </div>
          </div>

          <!-- Results -->
          <template v-else>
            <SpecialistCard
              v-for="specialist in filtered"
              :key="specialist.id"
              :specialist="specialist"
              :active="selectedId === specialist.id"
              @select="(id) => selectSpecialist(id, 'list')"
            />
          </template>

          <!-- Partner callout -->
          <div v-if="!dataLoading" class="fs-partner">
            <p class="fs-partner__title">{{ t("website.findSpecialist.network.partnerTitle") }}</p>
            <p class="fs-partner__desc">{{ t("website.findSpecialist.network.partnerDesc") }}</p>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="fs-partner__link">
              {{ t("website.findSpecialist.network.partnerCta") }} →
            </RouterLink>
          </div>
        </div>

        <div class="fs-layout__map">
          <div class="fs-map-wrap" :class="{ 'fs-map-wrap--loading': mapLoading }">
            <div ref="mapContainer" class="fs-map" role="region" :aria-label="t('website.findSpecialist.mapTitle')" />
            <!-- Only the map's own failure (bad key, blocked script) — the list keeps working (NEO-81). -->
            <div v-if="mapError && !mapLoading" class="fs-map__overlay">
              <p class="fs-map__error-text">{{ t("website.findSpecialist.mapUnavailable") }}</p>
              <button type="button" class="fs-state__btn" @click="retryMap">{{ t("website.findSpecialist.retry") }}</button>
            </div>
            <p v-else-if="mapLoading" class="fs-map__overlay fs-map__loading">{{ t("website.findSpecialist.mapLoading") }}</p>
          </div>

          <!-- Phone map mode: the tapped pin's clinic, above the map -->
          <div v-if="selectedSpecialist" class="fs-map-card">
            <button type="button" class="fs-map-card__close" :aria-label="t('website.findSpecialist.closeCard')" @click="selectSpecialist(null, 'list')">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
            <SpecialistCard :specialist="selectedSpecialist" :active="true" @select="(id) => selectSpecialist(id, 'list')" />
          </div>
        </div>
      </div>
    </section>

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
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useReveal } from "../composables/useReveal";
import { useSeoMeta } from "../composables/useSeoMeta";
import { useSpecialistMap } from "../composables/useSpecialistMap";
import SpecialistCard from "../components/SpecialistCard.vue";
import {
  availableSpecialties,
  matchesSearch,
  matchesSpecialty,
  specialtyLabelKey,
  type LabelledSpecialty,
  type Specialist,
} from "../utils/specialists";
import { isApiError, readJson, reportCaught } from "@api";
import { useErrorTextFor } from "@ui";
import { apiFetch } from "../utils/api";

/**
 * Public "find a specialist" page (NEO-79, layout option A): the clinic list
 * on the left and a sticky map on the right; on a phone the list comes first
 * with a List / Map toggle. The list is the primary, accessible content —
 * it renders from the API even when Google Maps fails, and the map mirrors
 * the list (selecting a card pans to its pin, tapping a pin selects the card).
 *
 * The page loads the directory once (≤ 100 clinics, see
 * PUBLIC_SPECIALISTS_LIMIT in the API) and filters it client-side as the
 * user types, so search is instant and never spends the endpoint's rate limit.
 */

const { t, locale, availableLocales } = useI18n();

useSeoMeta({ titleKey: "website.seo.findSpecialist.title", descriptionKey: "website.seo.findSpecialist.description" });

const searchQuery = ref("");
const activeSpecialty = ref<LabelledSpecialty | null>(null);
const specialists = ref<Specialist[]>([]);
const dataLoading = ref(true);
/** Why the specialists request failed (NEO-81) — null while it hasn't. */
const dataFailure = ref<unknown>(null);
const dataFailureText = useErrorTextFor(dataFailure);
const selectedId = ref<string | null>(null);
const view = ref<"list" | "map">("list");
const listRef = ref<HTMLElement | null>(null);
const mapContainer = ref<HTMLElement | null>(null);

/** A specialty's label in every site language, so "dentysta" finds a dentist on the Spanish page too. */
function labelsFor(code: LabelledSpecialty): string[] {
  return availableLocales.map((l) => t(specialtyLabelKey(code), {}, { locale: l }));
}

const chips = computed(() => availableSpecialties(specialists.value));
const chipLabel = computed(() => (activeSpecialty.value ? t(specialtyLabelKey(activeSpecialty.value)) : ""));

const filtered = computed(() =>
  specialists.value.filter(
    (s) => matchesSpecialty(s, activeSpecialty.value) && matchesSearch(s, searchQuery.value, labelsFor),
  ),
);

const selectedSpecialist = computed(() => filtered.value.find((s) => s.id === selectedId.value) ?? null);

const { mapLoading, mapError, ensureMap, render, select, fit } = useSpecialistMap({
  container: mapContainer,
  locale,
  onSelect: (id) => selectSpecialist(id, "map"),
  clusterTitle: (count) => t("website.findSpecialist.clusterTitle", { count }),
});

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Card → pin: highlight and pan the map to it. Pin → card: highlight the
 * card and scroll it into view in the list (on a phone in map mode the
 * card appears above the map instead).
 */
function selectSpecialist(id: string | null, source: "list" | "map") {
  selectedId.value = id;
  select(id, { pan: source === "list" });
  if (source !== "map" || !id) return;
  void nextTick(() => {
    const cards = listRef.value?.querySelectorAll<HTMLElement>("[data-specialist-id]") ?? [];
    const card = Array.from(cards).find((el) => el.dataset.specialistId === id);
    card?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });
}

watch(filtered, (results) => {
  if (selectedId.value && !results.some((s) => s.id === selectedId.value)) selectSpecialist(null, "list");
  render(results);
});

async function setView(next: "list" | "map") {
  view.value = next;
  if (next !== "map") return;
  // The map was display:none on a phone until now — fit once it has a size.
  await nextTick();
  if (await ensureMap()) fit();
}

function clearSearch() {
  searchQuery.value = "";
}

function clearFilters() {
  searchQuery.value = "";
  activeSpecialty.value = null;
}

// A couple of silent retries before surfacing an error — the API can
// genuinely still be waking up on the very first request (a cold start
// after inactivity; the same thing shows up locally if the dev API is
// still finishing its DB connection when the page loads).
const FETCH_RETRY_DELAYS_MS = [1500, 3000];

/** Retrying only helps when the server may answer differently in a moment. */
function isRetryable(err: unknown): boolean {
  return isApiError(err) && err.kind !== "client" && err.kind !== "rate_limited";
}

async function fetchSpecialists() {
  dataLoading.value = true;
  dataFailure.value = null;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await apiFetch("/api/v1/public/specialists");
      // readJson throws a typed ApiError for a non-2xx *and* for a 200 that isn't JSON
      // (e.g. index.html when VITE_API_URL is missing) — the silent case behind NEO-81.
      const data = await readJson<{ specialists: Specialist[] }>(res, { path: "/api/v1/public/specialists" });
      specialists.value = data.specialists;
      dataLoading.value = false;
      return;
    } catch (err) {
      const delay = FETCH_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryable(err)) {
        reportCaught(err, { where: "web.FindSpecialistView.fetchSpecialists", extra: { attempts: attempt + 1 } });
        dataFailure.value = err;
        dataLoading.value = false;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function retryMap() {
  await ensureMap();
}

async function retry() {
  await Promise.all([fetchSpecialists(), ensureMap()]);
}

onMounted(async () => {
  // Independent failure modes (a slow/broken API vs. a bad Maps key) — run
  // both at once so one failing never blocks the other.
  await Promise.all([fetchSpecialists(), ensureMap()]);
});

const ctaRef = ref<HTMLElement | null>(null);
const ctaVisible = useReveal(ctaRef, 0.10);
</script>

<style lang="scss">
@layer components {
  .fs-hero {
    text-align: center;
    padding-bottom: 1.5rem;
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

  // ── Search + chips ────────────────────────────────────────────────────────
  .fs-search {
    max-width: 560px;
    margin: 2rem auto 0;
  }

  .fs-search__field {
    position: relative;
  }

  .fs-search__icon {
    position: absolute;
    top: 50%;
    left: 1.125rem;
    width: 20px;
    height: 20px;
    transform: translateY(-50%);
    color: var(--website-primary);
    pointer-events: none;
  }

  .fs-search__input {
    width: 100%;
    height: 52px;
    border: 1.5px solid var(--website-border);
    border-radius: 9999px;
    padding: 0 3rem 0 3rem;
    font: inherit;
    font-size: 1rem;
    background: var(--website-bg);
    color: var(--website-text);
    outline: none;
    transition: border-color 0.2s;
    -webkit-appearance: none;
    appearance: none;

    &:focus-visible { border-color: var(--website-primary); box-shadow: 0 0 0 3px var(--website-icon-bg); }
    &::placeholder { color: var(--website-text-secondary); opacity: 0.8; }
    &::-webkit-search-cancel-button { display: none; }
  }

  .fs-search__clear {
    position: absolute;
    top: 50%;
    right: 0.375rem;
    transform: translateY(-50%);
    width: var(--website-btn-min-width);
    height: var(--website-btn-min-height);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--website-text-secondary);
    cursor: pointer;

    svg { width: 18px; height: 18px; }
    &:hover { background: var(--website-surface-container); color: var(--website-text); }
  }

  .fs-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin: 1rem auto 0;
    max-width: 720px;
  }

  .fs-chip {
    min-height: 36px;
    padding: 0 1rem;
    border-radius: 9999px;
    border: 1px solid var(--website-border);
    background: var(--website-bg);
    color: var(--website-text-secondary);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;

    &:hover { border-color: var(--website-primary); color: var(--website-primary); }
  }

  .fs-chip--on,
  .fs-chip--on:hover {
    background: var(--website-primary);
    border-color: var(--website-primary);
    color: #fff;
    font-weight: 600;
  }

  // ── Results bar + list/map toggle ─────────────────────────────────────────
  .fs-results {
    text-align: left;
    padding-bottom: 3rem;
  }

  .fs-results__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 44px;
    margin-bottom: 0.75rem;
  }

  .fs-results__count {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--website-text);
  }

  // Only shown on a narrow page (website-responsive.scss) — on desktop both are visible.
  .fs-view-toggle {
    display: none;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    border-radius: 9999px;
    background: var(--website-surface-container);
  }

  .fs-view-toggle__btn {
    min-height: 38px;
    min-width: 88px;
    border: none;
    border-radius: 9999px;
    background: transparent;
    color: var(--website-text-secondary);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .fs-view-toggle__btn--on {
    background: var(--website-bg);
    color: var(--website-text);
    box-shadow: var(--website-shadow-sm);
  }

  // ── Split layout ──────────────────────────────────────────────────────────
  .fs-layout {
    display: grid;
    grid-template-columns: minmax(340px, 420px) 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  .fs-layout__list {
    display: grid;
    gap: 0.875rem;
    align-content: start;
    min-width: 0;
  }

  .fs-layout__map {
    position: sticky;
    top: calc(var(--website-header-height) + 1rem);
    min-width: 0;
  }

  .fs-map-wrap {
    position: relative;
    width: 100%;
    height: calc(100vh - var(--website-header-height) - 2rem);
    min-height: 420px;
    max-height: 760px;
    border-radius: var(--website-card-radius);
    overflow: hidden;
    // A visible silhouette before the map paints — neutral grey, never brand-tinted.
    background: var(--website-page-frame-bg);
    border-bottom: 3px solid transparent;
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

  .fs-map__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    margin: 0;
    text-align: center;
  }

  .fs-map__loading {
    color: var(--website-text-secondary);
    font-size: 0.9375rem;
    pointer-events: none;
  }

  .fs-map__error-text {
    margin: 0;
    max-width: 320px;
    color: var(--website-text-secondary);
    font-size: 0.9375rem;
  }

  // Only used on a phone in map mode (website-responsive.scss).
  .fs-map-card {
    display: none;
  }

  .fs-map-card__close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 1;
    width: var(--website-btn-min-width);
    height: var(--website-btn-min-height);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--website-text-secondary);
    cursor: pointer;

    svg { width: 18px; height: 18px; }
  }

  // ── Map pins (AdvancedMarkerElement content, see useSpecialistMap.ts) ─────
  .fs-pin {
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .fs-pin__head {
    width: 32px;
    height: 32px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    background: var(--website-primary);
    border: 2.5px solid #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    display: grid;
    place-items: center;
    transition: transform 0.15s ease, background-color 0.15s ease;

    svg { width: 15px; height: 15px; color: #fff; transform: rotate(45deg); }
  }

  .fs-pin--active .fs-pin__head {
    background: var(--neosleep-very-dark-teal, #0b4a44);
    transform: rotate(-45deg) scale(1.3);
  }

  .fs-cluster {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--website-icon-bg);
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .fs-cluster__count {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--website-primary);
    border: 2px solid #fff;
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.9375rem;
  }

  // ── Card ──────────────────────────────────────────────────────────────────
  .fs-card {
    position: relative;
    display: grid;
    gap: 0.4rem;
    padding: 1rem 1.125rem;
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
    cursor: pointer;
    transition: box-shadow 0.2s, border-color 0.2s;

    &:hover { box-shadow: var(--website-shadow-md); }
  }

  .fs-card--active {
    border-color: var(--website-primary);
    box-shadow: 0 0 0 2px var(--website-icon-bg), var(--website-shadow-md);
  }

  .fs-card__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .fs-card__tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 24px;
    padding: 0 0.625rem;
    border-radius: 9999px;
    background: var(--website-icon-bg);
    color: var(--website-primary);
    font-size: 0.75rem;
    font-weight: 650;

    svg { width: 12px; height: 12px; }
  }

  .fs-card__title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--website-text);
  }

  .fs-card__select {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &:focus-visible { outline: 2px solid var(--website-primary); outline-offset: 3px; border-radius: 4px; }
  }

  .fs-card__address {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--website-text-secondary);
  }

  .fs-card__doctors {
    display: flex;
    align-items: flex-start;
    gap: 0.375rem;
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.45;
    color: var(--website-text-secondary);

    svg { flex: none; width: 15px; height: 15px; margin-top: 0.15em; color: var(--website-primary); }
  }

  .fs-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.375rem;
  }

  .fs-card__action {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: var(--website-btn-min-height);
    padding: 0 0.9rem;
    border-radius: 9999px;
    border: 1px solid var(--website-border);
    color: var(--website-text);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: border-color 0.15s, background-color 0.15s;

    svg { width: 15px; height: 15px; color: var(--website-primary); flex: none; }
    &:hover { border-color: var(--website-primary); }
    &:focus-visible { outline: 2px solid var(--website-primary); outline-offset: 2px; }
  }

  .fs-card__action--primary {
    background: var(--website-primary);
    border-color: var(--website-primary);
    color: #fff;

    svg { color: #fff; }
    &:hover { background: var(--website-primary-hover); border-color: var(--website-primary-hover); }
  }

  .fs-card__phone {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    opacity: 0.92;
  }

  // Skeleton
  .fs-card--skeleton {
    cursor: default;
    gap: 0.6rem;
    &:hover { box-shadow: none; }
  }

  .fs-skel {
    display: block;
    border-radius: 8px;
    background: linear-gradient(90deg, var(--website-skeleton-base) 25%, var(--website-skeleton-highlight) 50%, var(--website-skeleton-base) 75%);
    background-size: 300% 100%;
    animation: fs-skel 1.4s ease-in-out infinite;
  }

  .fs-skel--tag { width: 120px; height: 22px; border-radius: 9999px; }
  .fs-skel--title { width: 70%; height: 20px; }
  .fs-skel--line { width: 90%; height: 14px; }
  .fs-skel--actions { width: 60%; height: 40px; border-radius: 9999px; }

  @keyframes fs-skel {
    from { background-position: 100% 0; }
    to { background-position: 0 0; }
  }

  // ── Empty / error states ──────────────────────────────────────────────────
  .fs-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.625rem;
    padding: 2.5rem 1.5rem;
    text-align: center;
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
  }

  .fs-state__icon {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--website-icon-bg);
    color: var(--website-primary);
    display: grid;
    place-items: center;

    svg { width: 24px; height: 24px; }
  }

  .fs-state__icon--error {
    background: rgba(179, 38, 30, 0.1);
    color: #b3261e;

    [data-theme="dark"] & { background: rgba(242, 135, 127, 0.15); color: #f2877f; }
  }

  .fs-state__title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--website-text);
  }

  .fs-state__desc {
    margin: 0;
    max-width: 340px;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--website-text-secondary);
  }

  .fs-state__ref {
    margin: 0;
    padding: 0.125rem 0.5rem;
    border-radius: 6px;
    background: var(--website-surface-container);
    color: var(--website-text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }

  .fs-state__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .fs-state__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--website-btn-min-height);
    padding: 0 1.25rem;
    border: 1.5px solid var(--website-primary);
    border-radius: 9999px;
    background: var(--website-bg);
    color: var(--website-primary);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover { background: var(--website-primary); color: #fff; }
  }

  .fs-state__btn--primary {
    background: var(--website-primary);
    color: #fff;

    &:hover { background: var(--website-primary-hover); border-color: var(--website-primary-hover); }
  }

  // ── Partner callout ───────────────────────────────────────────────────────
  .fs-partner {
    display: grid;
    gap: 0.3rem;
    padding: 1rem 1.125rem;
    border: 1px dashed var(--website-footer-card-border);
    border-radius: var(--website-card-radius);
  }

  .fs-partner__title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--website-text);
  }

  .fs-partner__desc {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--website-text-secondary);
  }

  .fs-partner__link {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-primary);
    text-decoration: none;

    &:hover { text-decoration: underline; }
  }

  // ── Bottom CTA ────────────────────────────────────────────────────────────
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
