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
          @keydown.enter="openModal"
        />
        <button class="home-btn home-btn--primary" @click="openModal">
          {{ t("website.findSpecialist.searchBtn") }}
        </button>
      </div>
    </section>

    <!-- ── Map ───────────────────────────────────────────────────────────── -->
    <div ref="mapRef" class="fs-map-wrap">
      <iframe
        src="https://maps.google.com/maps?q=Ciudad+de+Mexico&output=embed&z=11"
        class="fs-map"
        width="100%"
        height="100%"
        style="border: 0"
        allowfullscreen
        loading="lazy"
        :title="t('website.findSpecialist.mapTitle')"
      ></iframe>
    </div>

    <!-- ── Specialist directory ──────────────────────────────────────────── -->
    <section class="home-section fs-results page-container">
      <h2 class="home-heading">{{ t("website.findSpecialist.nearbyTitle") }}</h2>
      <p class="fs-results__note">{{ t("website.findSpecialist.networkNote") }}</p>

      <div class="fs-network-grid">

        <!-- Empty state -->
        <div class="fs-network-empty">
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

    <!-- ── Coming Soon Modal ──────────────────────────────────────────────── -->
    <Transition name="fs-modal">
      <div v-if="modalOpen" class="fs-modal-overlay" @click.self="modalOpen = false">
        <div class="fs-modal" role="dialog" :aria-label="t('website.findSpecialist.modal.title')">
          <button class="fs-modal__close" :aria-label="t('website.findSpecialist.modal.close')" @click="modalOpen = false">✕</button>
          <div class="fs-modal__icon">🔬</div>
          <h2 class="fs-modal__title">{{ t("website.findSpecialist.modal.title") }}</h2>
          <p class="fs-modal__body">{{ t("website.findSpecialist.modal.body") }}</p>
          <p class="fs-modal__nudge">{{ t("website.findSpecialist.modal.nudge") }}</p>
          <RouterLink
            :to="{ path: '/contact', query: { type: 'patient', ref: 'specialist-search' } }"
            class="home-btn home-btn--primary fs-modal__cta"
            @click="modalOpen = false"
          >
            {{ t("website.findSpecialist.modal.cta") }}
            <span class="home-btn__arrow" aria-hidden="true">→</span>
          </RouterLink>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useReveal } from "@shared/composables/useReveal";
import { useSeoMeta } from "../composables/useSeoMeta";

const { t } = useI18n();
useSeoMeta({ titleKey: "website.seo.findSpecialist.title", descriptionKey: "website.seo.findSpecialist.description" });

const searchQuery = ref("");
const modalOpen = ref(false);

function openModal() {
  if (!searchQuery.value.trim()) return;
  modalOpen.value = true;
}

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
  }

  /* ── Map ─────────────────────────────────────────────────────────────── */
  .fs-map-wrap {
    width: 100%;
    height: 480px;
  }

  .fs-map {
    display: block;
    width: 100%;
    height: 100%;
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

  .fs-network-empty,
  .fs-network-partner {
    flex: 1 1 280px;
    max-width: 420px;
  }

  .fs-network-empty {
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
    padding: 2.5rem 2rem;
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

  /* ── Modal ───────────────────────────────────────────────────────────── */
  .fs-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .fs-modal {
    position: relative;
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: 20px;
    padding: 3rem 2.5rem 2.5rem;
    max-width: 480px;
    width: 100%;
    text-align: center;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
  }

  .fs-modal__close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 1.125rem;
    color: var(--website-text-secondary);
    cursor: pointer;
    line-height: 1;
    padding: 0.25rem;
    opacity: 0.6;
    transition: opacity 0.15s;

    &:hover { opacity: 1; }
  }

  .fs-modal__icon {
    font-size: 2.75rem;
    line-height: 1;
    margin-bottom: 1.25rem;
  }

  .fs-modal__title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.875rem;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .fs-modal__body {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--website-text-secondary);
    margin: 0 0 0.75rem;
  }

  .fs-modal__nudge {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--website-primary);
    margin: 0 0 1.75rem;
  }

  .fs-modal__cta {
    display: inline-flex;
    width: 100%;
    justify-content: center;
  }

  /* ── Modal transition ────────────────────────────────────────────────── */
  .fs-modal-enter-active,
  .fs-modal-leave-active {
    transition: opacity 0.22s ease;

    .fs-modal {
      transition: transform 0.22s ease, opacity 0.22s ease;
    }
  }

  .fs-modal-enter-from,
  .fs-modal-leave-to {
    opacity: 0;

    .fs-modal {
      transform: translateY(16px) scale(0.97);
      opacity: 0;
    }
  }
}
</style>
