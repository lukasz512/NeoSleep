<template>
  <div class="view-about">

    <!-- ── Hero ─────────────────────────────────────────────────────── -->
    <TealBanner
      eyebrow-key="website.about.eyebrow"
      line1-key="website.about.heroTagline1"
      line2-key="website.about.heroTagline2"
      subtitle-key="website.about.heroSub"
    >
      <template #ctas>
        <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="home-btn home-btn--white-outline">
          {{ t("website.about.cta.patient") }}
          <span class="home-btn__arrow" aria-hidden="true">→</span>
        </RouterLink>
        <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-border">
          {{ t("website.about.cta.professional") }}
        </RouterLink>
      </template>
    </TealBanner>

    <!-- ── Mission ───────────────────────────────────────────────────── -->
    <section ref="missionRef" class="home-section ab-mission home-reveal" :class="{ 'home-reveal--visible': missionVisible }">
      <div class="page-container">
        <div class="ab-mission__grid">
          <div class="ab-mission__body">
            <p class="home-eyebrow ab-align-left">{{ t("website.about.mission.eyebrow") }}</p>
            <h2 class="home-heading ab-align-left ab-mission__heading">
              <span class="ab-mission__heading-l1">{{ t("website.about.mission.heading1") }}</span>
              <span class="ab-mission__heading-l2">{{ t("website.about.mission.heading2") }}</span>
            </h2>
            <p class="ab-mission__text">{{ t("website.about.mission.body") }}</p>
          </div>
          <div class="ab-mission__media">
            <img src="/images/mission.jpg" alt="" class="ab-mission__img" width="600" height="400" loading="lazy" />
          </div>
        </div>
      </div>
    </section>

    <!-- ── Values ────────────────────────────────────────────────────── -->
    <section ref="valuesRef" class="home-section ab-values home-reveal" :class="{ 'home-reveal--visible': valuesVisible }">
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.about.values.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.about.values.heading") }}</h2>
        <div class="ab-vgrid">

          <div class="ab-vcard">
            <div class="ab-vcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 2h4M12 2v4M6 6h12l-1.5 9H7.5L6 6z"/>
                <path d="M8.5 15c0 3.5 7 3.5 7 0"/>
                <path d="M10 19v2M14 19v2M8 21h8"/>
              </svg>
            </div>
            <h3 class="ab-vcard__title">{{ t("website.about.values.research.title") }}</h3>
            <p class="ab-vcard__desc">{{ t("website.about.values.research.desc") }}</p>
          </div>

          <div class="ab-vcard">
            <div class="ab-vcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 class="ab-vcard__title">{{ t("website.about.values.human.title") }}</h3>
            <p class="ab-vcard__desc">{{ t("website.about.values.human.desc") }}</p>
          </div>

          <div class="ab-vcard">
            <div class="ab-vcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
            <h3 class="ab-vcard__title">{{ t("website.about.values.innovation.title") }}</h3>
            <p class="ab-vcard__desc">{{ t("website.about.values.innovation.desc") }}</p>
          </div>

          <div class="ab-vcard">
            <div class="ab-vcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 8C8 10 5.9 16.17 3.82 19.34A1 1 0 0 0 4.68 21a1 1 0 0 0 1.17-.28C7.36 18.7 9.48 17 12 17c3.31 0 6-2.69 6-6A7 7 0 0 0 11 5c3.36 1.5 6 4.59 6 8"/>
              </svg>
            </div>
            <h3 class="ab-vcard__title">{{ t("website.about.values.eco.title") }}</h3>
            <p class="ab-vcard__desc">{{ t("website.about.values.eco.desc") }}</p>
          </div>

        </div>
      </div>
    </section>

    <!-- ── Stats ─────────────────────────────────────────────────────── -->
    <section ref="statsRef" class="ab-stats home-reveal" :class="{ 'home-reveal--visible': statsVisible }">
      <div class="page-container">
        <div class="ab-stats__row">
          <div class="ab-stat">
            <span class="ab-stat__number">{{ t("website.about.stats.studies") }}</span>
            <span class="ab-stat__label">{{ t("website.about.stats.studiesLabel") }}</span>
          </div>
          <div class="ab-stat">
            <span class="ab-stat__number">{{ t("website.about.stats.satisfaction") }}</span>
            <span class="ab-stat__label">{{ t("website.about.stats.satisfactionLabel") }}</span>
          </div>
          <div class="ab-stat">
            <span class="ab-stat__number">{{ t("website.about.stats.professionals") }}</span>
            <span class="ab-stat__label">{{ t("website.about.stats.specialistsLabel") }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Approach ───────────────────────────────────────────────────── -->
    <section ref="approachRef" class="home-section ab-approach home-reveal" :class="{ 'home-reveal--visible': approachVisible }">
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.about.approach.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.about.approach.heading") }}</h2>
        <p class="home-sub home-sub--center">{{ t("website.about.approach.sub") }}</p>
        <div class="ab-steps">
          <div class="ab-step">
            <span class="ab-step__num">{{ t("website.about.approach.step1.num") }}</span>
            <h3 class="ab-step__title">{{ t("website.about.approach.step1.title") }}</h3>
            <p class="ab-step__desc">{{ t("website.about.approach.step1.desc") }}</p>
          </div>
          <div class="ab-step__connector" aria-hidden="true"></div>
          <div class="ab-step">
            <span class="ab-step__num">{{ t("website.about.approach.step2.num") }}</span>
            <h3 class="ab-step__title">{{ t("website.about.approach.step2.title") }}</h3>
            <p class="ab-step__desc">{{ t("website.about.approach.step2.desc") }}</p>
          </div>
          <div class="ab-step__connector" aria-hidden="true"></div>
          <div class="ab-step">
            <span class="ab-step__num">{{ t("website.about.approach.step3.num") }}</span>
            <h3 class="ab-step__title">{{ t("website.about.approach.step3.title") }}</h3>
            <p class="ab-step__desc">{{ t("website.about.approach.step3.desc") }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Offices ────────────────────────────────────────────────────── -->
    <section ref="officesRef" class="home-section ab-offices home-reveal" :class="{ 'home-reveal--visible': officesVisible }">
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.about.offices.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.about.offices.heading") }}</h2>
        <p class="home-sub home-sub--center">{{ t("website.about.offices.sub") }}</p>
        <div class="ab-offices__grid">

          <!-- Ciudad de México HQ -->
          <div class="ab-office-card">
            <div class="ab-office-card__top">
              <span class="ab-office-card__badge ab-office-card__badge--hq">{{ t("website.about.offices.hq") }}</span>
            </div>
            <h3 class="ab-office-card__city">{{ t("website.about.offices.cdmx.city") }}</h3>
            <p class="ab-office-card__country">{{ t("website.about.offices.cdmx.country") }}</p>
            <address class="ab-office-card__address">{{ t("website.about.offices.cdmx.address") }}</address>
            <a
              href="https://maps.google.com/?q=Av.+Insurgentes+Sur+1602+Ciudad+de+Mexico"
              target="_blank"
              rel="noopener noreferrer"
              class="ab-office-card__map-link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {{ t("website.about.offices.mapLink") }}
            </a>
          </div>

          <!-- Warsaw -->
          <div class="ab-office-card">
            <div class="ab-office-card__top">
              <span class="ab-office-card__badge">{{ t("website.about.offices.clinic") }}</span>
            </div>
            <h3 class="ab-office-card__city">{{ t("website.about.offices.warsaw.city") }}</h3>
            <p class="ab-office-card__country">{{ t("website.about.offices.warsaw.country") }}</p>
            <address class="ab-office-card__address">{{ t("website.about.offices.warsaw.address") }}</address>
            <a
              href="https://maps.google.com/?q=Marszalkowska+111+Warsaw+Poland"
              target="_blank"
              rel="noopener noreferrer"
              class="ab-office-card__map-link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {{ t("website.about.offices.mapLink") }}
            </a>
          </div>

          <!-- Expansion teaser -->
          <div class="ab-office-card ab-office-card--expansion">
            <div class="ab-office-card__expand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <h3 class="ab-office-card__city ab-office-card__city--muted">{{ t("website.about.offices.expanding.title") }}</h3>
            <p class="ab-office-card__expand-desc">{{ t("website.about.offices.expanding.desc") }}</p>
            <RouterLink :to="{ path: '/contact' }" class="ab-office-card__expand-link">
              {{ t("website.about.offices.expanding.cta") }} →
            </RouterLink>
          </div>

        </div>
      </div>
    </section>

    <!-- ── CTA ────────────────────────────────────────────────────────── -->
    <div ref="ctaRef" class="ab-cta-wrap home-reveal" :class="{ 'home-reveal--visible': ctaVisible }">
      <div class="page-container">
        <TealBanner variant="cta" line1-key="website.about.cta.heading" subtitle-key="website.about.cta.sub">
          <template #ctas>
            <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="home-btn home-btn--white-outline">
              {{ t("website.about.cta.patient") }}
              <span class="home-btn__arrow" aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-border">
              {{ t("website.about.cta.professional") }}
            </RouterLink>
          </template>
        </TealBanner>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import TealBanner from "../components/TealBanner.vue";
import { useReveal } from "@neo/shared/composables/useReveal";
import { useSeoMeta } from "../composables/useSeoMeta";

const { t } = useI18n();
useSeoMeta({ titleKey: "website.seo.about.title", descriptionKey: "website.seo.about.description" });

const missionRef  = ref<HTMLElement | null>(null);
const valuesRef   = ref<HTMLElement | null>(null);
const statsRef    = ref<HTMLElement | null>(null);
const officesRef  = ref<HTMLElement | null>(null);
const approachRef = ref<HTMLElement | null>(null);
const ctaRef      = ref<HTMLElement | null>(null);

const missionVisible  = useReveal(missionRef,  0.10);
const valuesVisible   = useReveal(valuesRef,   0.08);
const statsVisible    = useReveal(statsRef,    0.15);
const officesVisible  = useReveal(officesRef,  0.08);
const approachVisible = useReveal(approachRef, 0.08);
const ctaVisible      = useReveal(ctaRef,      0.10);
</script>

<style lang="scss" scoped src="./AboutView.scss" />
