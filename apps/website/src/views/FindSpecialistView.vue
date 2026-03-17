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
      <div class="fs-search">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('website.findSpecialist.searchPlaceholder')"
          class="fs-search__input"
          @keydown.enter="performSearch"
        />
        <button class="home-btn home-btn--primary" @click="performSearch">
          {{ t("website.findSpecialist.searchBtn") }}
        </button>
      </div>
    </section>

    <!-- ── Map ───────────────────────────────────────────────────────────── -->
    <div ref="mapRef" class="fs-map-wrap">
      <iframe
        :src="mapSrc"
        class="fs-map"
        width="100%"
        height="100%"
        style="border: 0"
        allowfullscreen
        loading="lazy"
        :title="t('website.findSpecialist.mapTitle')"
      ></iframe>
    </div>

    <!-- ── Nearby specialists ─────────────────────────────────────────────── -->
    <section class="home-section fs-results page-container">
      <h2 class="home-heading">{{ t("website.findSpecialist.nearbyTitle") }}</h2>
      <p class="fs-results__note">{{ t("website.findSpecialist.nearbyNote") }}</p>
      <div class="fs-results__grid">

        <!-- TODO: replace with real API data -->
        <div class="fs-clinic-card">
          <span class="fs-clinic-card__badge">Certified Partner</span>
          <p class="fs-clinic-card__name">Dr. Anna Kowalska</p>
          <p class="fs-clinic-card__addr">ul. Marszałkowska 142, Warsaw</p>
          <a
            href="https://maps.google.com/maps?q=ul.+Marsza%C5%82kowska+142+Warsaw"
            target="_blank"
            rel="noopener noreferrer"
            class="fs-clinic-card__link"
          >View on map →</a>
        </div>

        <!-- TODO: replace with real API data -->
        <div class="fs-clinic-card">
          <span class="fs-clinic-card__badge">Certified Partner</span>
          <p class="fs-clinic-card__name">Dr. Jan Nowak</p>
          <p class="fs-clinic-card__addr">al. Ujazdowskie 26, Warsaw</p>
          <a
            href="https://maps.google.com/maps?q=al.+Ujazdowskie+26+Warsaw"
            target="_blank"
            rel="noopener noreferrer"
            class="fs-clinic-card__link"
          >View on map →</a>
        </div>

        <!-- TODO: replace with real API data -->
        <div class="fs-clinic-card">
          <span class="fs-clinic-card__badge">Certified Partner</span>
          <p class="fs-clinic-card__name">Centrum Snu</p>
          <p class="fs-clinic-card__addr">ul. Puławska 39, Warsaw</p>
          <a
            href="https://maps.google.com/maps?q=ul.+Pu%C5%82awska+39+Warsaw"
            target="_blank"
            rel="noopener noreferrer"
            class="fs-clinic-card__link"
          >View on map →</a>
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
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const searchQuery = ref("");
const activeQuery = ref("sleep apnea dentist");

const mapSrc = computed(() => {
  const q = activeQuery.value || "sleep apnea dentist";
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed&z=12`;
});

function performSearch() {
  if (!searchQuery.value.trim()) return;
  activeQuery.value = searchQuery.value.trim() + " sleep apnea dentist";
}

const mapRef = ref<HTMLElement | null>(null);
const ctaRef = ref<HTMLElement | null>(null);
const ctaVisible = ref(false);

let observers: IntersectionObserver[] = [];

onMounted(() => {
  const sections = [
    { el: ctaRef.value, visible: ctaVisible, threshold: 0.10 },
  ];
  for (const s of sections) {
    if (!s.el) continue;
    const obs = new IntersectionObserver(
      ([e]) => { if (e?.isIntersecting) { s.visible.value = true; obs.disconnect(); } },
      { threshold: s.threshold }
    );
    obs.observe(s.el);
    observers.push(obs);
  }
});

onUnmounted(() => observers.forEach(o => o.disconnect()));
</script>

<style lang="scss" scoped>
$bp-desktop: 960px;
$bp-tablet:  768px;
$bp-mobile:  600px;

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

  @media (max-width: $bp-mobile) {
    flex-direction: column;
  }
}

.fs-search__input {
  flex: 1;
  height: 52px;
  border: 1.5px solid var(--website-border);
  border-radius: 9999px;
  padding: 0 1.5rem;
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

  @media (max-width: $bp-mobile) {
    border-radius: 12px;
  }
}

/* ── Map ─────────────────────────────────────────────────────────────── */
.fs-map-wrap {
  width: 100%;
  height: 480px;

  @media (max-width: $bp-mobile) {
    height: 320px;
  }
}

.fs-map {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Results ─────────────────────────────────────────────────────────── */
.fs-results {
  text-align: left;
}

.fs-results__note {
  font-size: 0.875rem;
  color: var(--website-text-secondary);
  margin: 0.5rem 0 0;
}

.fs-results__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 1.75rem;

  @media (max-width: $bp-tablet) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: $bp-mobile) {
    grid-template-columns: 1fr;
  }
}

.fs-clinic-card {
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-card-radius);
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  transition: box-shadow 0.22s ease, transform 0.22s ease;

  &:hover {
    box-shadow: var(--website-shadow-md);
    transform: translateY(-2px);
  }
}

.fs-clinic-card__badge {
  display: inline-flex;
  align-items: center;
  background: var(--website-icon-bg);
  color: var(--website-primary);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
  align-self: flex-start;
  margin-bottom: 0.25rem;
}

.fs-clinic-card__name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0;
}

.fs-clinic-card__addr {
  font-size: 0.875rem;
  color: var(--website-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.fs-clinic-card__link {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--website-primary);
  text-decoration: none;
  margin-top: 0.25rem;
  align-self: flex-start;

  &:hover {
    text-decoration: underline;
  }
}

/* ── CTA ─────────────────────────────────────────────────────────────── */
.fs-cta-wrap {
  padding-bottom: 2.5rem;

  @media (max-width: $bp-mobile) {
    padding-bottom: 1.5rem;
  }
}

.fs-cta {
  background: linear-gradient(135deg, var(--neosleep-very-dark-teal) 0%, var(--neosleep-darker-teal) 100%);
  border-radius: var(--website-card-radius);
  padding: 4.5rem 2rem;
  text-align: center;

  @media (max-width: $bp-mobile) {
    padding: 3rem 1.5rem;
    border-radius: 14px;
  }
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
</style>
