<template>
  <section ref="sectionRef" class="home-hero" :class="{ 'home-hero--visible': visible }">
    <div class="home-hero__inner">
      <div class="home-hero__content">
        <h1 class="home-hero__title">
          <span class="home-hero__title-line1">{{ t("website.hero.titleLine1") }}</span>
          <span class="home-hero__title-line2">{{ t("website.hero.titleLine2") }}</span>
        </h1>
        <p class="home-hero__subtitle">{{ t("website.hero.subtitle") }}</p>
        <div class="home-hero__ctas">
          <a :href="config.ctaPrimary.href" class="home-btn home-btn--primary">
            {{ t(config.ctaPrimary.labelKey) }}
            <span class="home-btn__arrow" aria-hidden="true">→</span>
          </a>
          <a :href="config.ctaSecondary.href" class="home-btn home-btn--secondary">
            {{ t(config.ctaSecondary.labelKey) }}
          </a>
        </div>
      </div>
      <div class="home-hero__media">
        <img
          :src="config.imageSrc"
          alt=""
          class="home-hero__img"
          width="600"
          height="400"
          fetchpriority="high"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useReveal } from "@shared/composables/useReveal";
import { heroConfig as config } from "../config/websiteContent";

const { t } = useI18n();
const sectionRef = ref<HTMLElement | null>(null);
const visible    = useReveal(sectionRef, 0.1);
</script>

<style lang="scss">
@layer components {
  .home-hero {
    width: calc(100% - 2 * var(--website-page-gutter));
    max-width: var(--website-page-max-width);
    margin: 0 auto 2rem;
    border-radius: var(--website-card-radius);
    overflow: hidden;
    position: relative;
  }

  .home-hero__inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    align-items: center;
    padding: 3rem 2.5rem 4rem;
  }

  .home-hero__content {
    opacity: 0;
    transform: translateX(-1.5rem);
  }

  .home-hero--visible .home-hero__content {
    animation: hero-content-in 1.1s ease-out forwards;
  }

  @keyframes hero-content-in {
    0%   { opacity: 0; transform: translateX(-1.5rem); }
    60%  { opacity: 1; transform: translateX(0.06rem); }
    100% { opacity: 1; transform: translateX(0); }
  }

  @keyframes hero-content-in-mobile {
    0%   { opacity: 0; transform: translateY(1.5rem); }
    60%  { opacity: 1; transform: translateY(-0.1rem); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .home-hero__title {
    font-size: clamp(2rem, 4.5vw, 2.75rem);
    font-weight: 700;
    line-height: 1.12;
    letter-spacing: -0.025em;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.08em;
  }

  .home-hero__title-line1 { color: var(--website-text); }
  .home-hero__title-line2 { color: var(--website-primary); }

  .home-hero__subtitle {
    font-size: 1.0625rem;
    line-height: 1.65;
    color: var(--website-text-secondary);
    margin: 0 0 2rem;
  }

  .home-hero__ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 0.875rem;
  }

  .home-hero__media {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    max-height: 440px;
    overflow: hidden;
    border-radius: 14px;
    /* Skeleton shown while LCP image loads */
    background: linear-gradient(
      135deg,
      var(--website-skeleton-base)      0%,
      var(--website-skeleton-highlight) 50%,
      var(--website-skeleton-base)      100%
    );
  }

  .home-hero__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    border-radius: inherit;
    z-index: 1;
    opacity: 0;
    filter: blur(8px) saturate(0.5);
    transform: scale(1.02);

    [data-theme="dark"] & {
      filter: blur(8px) saturate(0.5) brightness(0.88) contrast(1.05);
    }
  }

  .home-hero--visible .home-hero__img {
    animation: hero-img-in 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;

    [data-theme="dark"] & {
      animation-name: hero-img-in-dark;
    }
  }

  @keyframes hero-img-in {
    0%   { opacity: 0;   filter: blur(8px) saturate(0.5); transform: scale(1.02); }
    40%  { opacity: 0.8; }
    100% { opacity: 1;   filter: blur(0) saturate(1); transform: scale(1); }
  }

  @keyframes hero-img-in-dark {
    0%   { opacity: 0;   filter: blur(8px) saturate(0.5) brightness(0.88) contrast(1.05); transform: scale(1.02); }
    40%  { opacity: 0.8; }
    100% { opacity: 1;   filter: blur(0) saturate(0.92) brightness(0.88) contrast(1.05); transform: scale(1); }
  }
}
</style>
