<template>
  <section class="home-hero">
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
import { useI18n } from "vue-i18n";
import { heroConfig as config } from "../config/websiteContent";

const { t } = useI18n();
</script>

<style lang="scss" scoped>
$bp-desktop: 960px;
$bp-mobile:  600px;

/* ── Keyframes ────────────────────────────────────────────────────────────── */
@keyframes hero-card-in {
  from { opacity: 0; transform: translateY(1.75rem) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes hero-line-in {
  from { opacity: 0; transform: translateX(-1.25rem); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes hero-line-in-mobile {
  from { opacity: 0; transform: translateY(1rem); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes hero-fade-up {
  from { opacity: 0; transform: translateY(1rem); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes hero-img-in {
  0%   { opacity: 0;   filter: blur(10px) saturate(0.4); transform: scale(1.03); }
  45%  { opacity: 0.8; }
  100% { opacity: 1;   filter: blur(0) saturate(1); transform: scale(1); }
}
@keyframes hero-img-in-dark {
  0%   { opacity: 0;   filter: blur(10px) saturate(0.4) brightness(0.88) contrast(1.05); transform: scale(1.03); }
  45%  { opacity: 0.8; }
  100% { opacity: 1;   filter: blur(0) saturate(0.92) brightness(0.88) contrast(1.05); transform: scale(1); }
}

/* ── Card ─────────────────────────────────────────────────────────────────── */
.home-hero {
  width: calc(100% - 2 * var(--website-page-gutter));
  max-width: var(--website-page-max-width);
  margin: 0 auto 2rem;
  border-radius: var(--website-card-radius);
  overflow: hidden;
  position: relative;
  animation: hero-card-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;

  @media (max-width: $bp-mobile) {
    width: calc(100% - 2 * var(--website-page-gutter-mobile));
    margin: 0 auto 1.5rem;
    border-radius: 14px 14px 0 0;
    border-bottom: 1px solid var(--website-border);
  }
}

/* ── Inner grid ───────────────────────────────────────────────────────────── */
.home-hero__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  padding: 3rem 2.5rem 4rem;

  @media (min-width: #{$bp-desktop + 1px}) { min-height: calc(100vh - var(--website-header-height)); }

  @media (max-width: $bp-desktop) {
    grid-template-columns: 1fr;
    text-align: center;
    padding: 2rem 2rem 3rem;
    gap: 1.75rem;
  }
  @media (max-width: $bp-mobile) {
    padding: 1.75rem 1.5rem 2.5rem;
    gap: 1.25rem;
  }
}

/* ── Title + content — staggered ─────────────────────────────────────────── */
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

.home-hero__title-line1 {
  color: var(--website-text);
  animation: hero-line-in 0.65s 0.15s cubic-bezier(0.16, 1, 0.3, 1) both;
  @media (max-width: $bp-desktop) { animation-name: hero-line-in-mobile; }
}

.home-hero__title-line2 {
  color: var(--website-primary);
  animation: hero-line-in 0.65s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  @media (max-width: $bp-desktop) { animation-name: hero-line-in-mobile; }
}

.home-hero__subtitle {
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--website-text-secondary);
  margin: 0 0 2rem;
  animation: hero-fade-up 0.6s 0.45s ease both;
}

.home-hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
  animation: hero-fade-up 0.6s 0.6s ease both;
  @media (max-width: $bp-desktop) { justify-content: center; }
}

/* ── Media ────────────────────────────────────────────────────────────────── */
.home-hero__media {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 440px;
  overflow: hidden;
  border-radius: 14px;

  @media (max-width: $bp-desktop) {
    order: -1;
    max-height: 260px;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
  }

  @media (max-width: $bp-mobile) {
    margin-left: -1.5rem;
    margin-right: -1.5rem;
    width: calc(100% + 3rem);
    max-height: none;
    aspect-ratio: 4 / 3;
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
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
  animation: hero-img-in 1.3s 0.1s cubic-bezier(0.16, 1, 0.3, 1) both;

  [data-theme="dark"] & { animation-name: hero-img-in-dark; }
}
</style>
