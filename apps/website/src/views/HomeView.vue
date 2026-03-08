<template>
  <div class="view-home" :class="{ 'view-home--dark': isDark }">
    <section class="view-home__hero">
      <div class="view-home__hero-inner">
        <div class="view-home__hero-content">
          <h1 class="view-home__hero-title">
            <span class="view-home__hero-title-line1">{{ t("website.hero.titleLine1") }}</span>
            <span class="view-home__hero-title-line2">{{ t("website.hero.titleLine2") }}</span>
          </h1>
          <p class="view-home__hero-subtitle">{{ t("website.hero.subtitle") }}</p>
          <div class="view-home__hero-ctas">
            <a href="#for-patients" class="view-home__btn view-home__btn--primary">
              {{ t("website.hero.ctaFindDentist") }}
              <span class="view-home__btn-arrow" aria-hidden="true">→</span>
            </a>
            <a href="#solutions" class="view-home__btn view-home__btn--secondary">{{ t("website.hero.ctaLearnMore") }}</a>
          </div>
        </div>
        <div class="view-home__hero-images">
          <div class="view-home__hero-moon" aria-hidden="true">
            <svg class="view-home__hero-moon-svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="60" cy="60" r="50" fill="rgba(255,255,255,0.12)" />
              <circle cx="60" cy="60" r="42" fill="rgba(255,255,255,0.08)" />
            </svg>
          </div>
          <img
            src="/images/hero.jpeg"
            alt=""
            class="view-home__hero-image view-home__hero-image--main"
            width="600"
            height="400"
            fetchpriority="high"
          />
        </div>
      </div>
    </section>

    <section class="view-home__stats">
      <div class="view-home__stats-inner">
        <div class="view-home__stat">
          <span class="view-home__stat-value">{{ t("website.stats.americans") }}</span>
          <span class="view-home__stat-label">{{ t("website.stats.americansLabel") }}</span>
        </div>
        <div class="view-home__stat">
          <span class="view-home__stat-value">{{ t("website.stats.undiagnosed") }}</span>
          <span class="view-home__stat-label">{{ t("website.stats.undiagnosedLabel") }}</span>
        </div>
        <div class="view-home__stat">
          <span class="view-home__stat-value">{{ t("website.stats.satisfaction") }}</span>
          <span class="view-home__stat-label">{{ t("website.stats.satisfactionLabel") }}</span>
        </div>
        <div class="view-home__stat">
          <span class="view-home__stat-value">{{ t("website.stats.dentists") }}</span>
          <span class="view-home__stat-label">{{ t("website.stats.dentistsLabel") }}</span>
        </div>
      </div>
    </section>

    <section id="solutions" class="view-home__section view-home__solutions">
      <h2 class="view-home__section-title">{{ t("website.solutions.title") }}</h2>
      <h3 class="view-home__section-heading">{{ t("website.solutions.heading") }}</h3>
      <p class="view-home__section-subtitle view-home__section-subtitle--center">{{ t("website.solutions.subtitle") }}</p>
      <div class="view-home__cards view-home__cards--two">
        <div class="view-home__card view-home__card--with-icon">
          <div class="view-home__card-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <h4 class="view-home__card-title">{{ t("website.solutions.therapy.title") }}</h4>
          <p class="view-home__card-desc">{{ t("website.solutions.therapy.desc") }}</p>
          <ul class="view-home__list view-home__list--checks">
            <li><span class="view-home__check" aria-hidden="true" /><span>{{ t("website.solutions.therapy.bullet1") }}</span></li>
            <li><span class="view-home__check" aria-hidden="true" /><span>{{ t("website.solutions.therapy.bullet2") }}</span></li>
            <li><span class="view-home__check" aria-hidden="true" /><span>{{ t("website.solutions.therapy.bullet3") }}</span></li>
          </ul>
        </div>
        <div class="view-home__card view-home__card--with-icon">
          <div class="view-home__card-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <h4 class="view-home__card-title">{{ t("website.solutions.diagnostics.title") }}</h4>
          <p class="view-home__card-desc">{{ t("website.solutions.diagnostics.desc") }}</p>
          <ul class="view-home__list view-home__list--checks">
            <li><span class="view-home__check" aria-hidden="true" /><span>{{ t("website.solutions.diagnostics.bullet1") }}</span></li>
            <li><span class="view-home__check" aria-hidden="true" /><span>{{ t("website.solutions.diagnostics.bullet2") }}</span></li>
            <li><span class="view-home__check" aria-hidden="true" /><span>{{ t("website.solutions.diagnostics.bullet3") }}</span></li>
          </ul>
        </div>
      </div>
    </section>

    <section id="for-dentists" class="view-home__section view-home__for-dentists">
      <div class="view-home__twocol view-home__twocol--image-left">
        <div class="view-home__twocol-image">
          <img src="/images/for-dentists.jpeg" alt="" class="view-home__img" width="560" height="400" />
        </div>
        <div class="view-home__twocol-content">
          <h2 class="view-home__section-title">{{ t("website.forDentists.title") }}</h2>
          <h3 class="view-home__section-heading">{{ t("website.forDentists.heading") }}</h3>
          <p class="view-home__section-subtitle">{{ t("website.forDentists.subtitle") }}</p>
          <div class="view-home__grid view-home__grid--2x2">
            <div class="view-home__feature">
              <span class="view-home__feature-icon" aria-hidden="true">👥</span>
              <h4 class="view-home__feature-title">{{ t("website.forDentists.expand.title") }}</h4>
              <p class="view-home__feature-desc">{{ t("website.forDentists.expand.desc") }}</p>
            </div>
            <div class="view-home__feature">
              <span class="view-home__feature-icon" aria-hidden="true">📈</span>
              <h4 class="view-home__feature-title">{{ t("website.forDentists.revenue.title") }}</h4>
              <p class="view-home__feature-desc">{{ t("website.forDentists.revenue.desc") }}</p>
            </div>
            <div class="view-home__feature">
              <span class="view-home__feature-icon" aria-hidden="true">🎓</span>
              <h4 class="view-home__feature-title">{{ t("website.forDentists.training.title") }}</h4>
              <p class="view-home__feature-desc">{{ t("website.forDentists.training.desc") }}</p>
            </div>
            <div class="view-home__feature">
              <span class="view-home__feature-icon" aria-hidden="true">❤️</span>
              <h4 class="view-home__feature-title">{{ t("website.forDentists.outcomes.title") }}</h4>
              <p class="view-home__feature-desc">{{ t("website.forDentists.outcomes.desc") }}</p>
            </div>
          </div>
          <div class="view-home__section-cta">
            <a href="#for-patients" class="view-home__btn view-home__btn--primary">{{ t("website.forDentists.cta") }}</a>
          </div>
        </div>
      </div>
    </section>

    <section id="for-patients" class="view-home__section view-home__for-patients">
      <div class="view-home__twocol view-home__twocol--image-right">
        <div class="view-home__twocol-content">
          <h2 class="view-home__section-title">{{ t("website.forPatients.title") }}</h2>
          <h3 class="view-home__section-heading">{{ t("website.forPatients.heading") }}</h3>
          <p class="view-home__section-subtitle">{{ t("website.forPatients.subtitle") }}</p>
          <ul class="view-home__feature-list">
            <li class="view-home__feature-item">
              <span class="view-home__feature-item-icon" aria-hidden="true">🌙</span>
              <div>
                <h4 class="view-home__feature-title">{{ t("website.forPatients.restful.title") }}</h4>
                <p class="view-home__feature-desc">{{ t("website.forPatients.restful.desc") }}</p>
              </div>
            </li>
            <li class="view-home__feature-item">
              <span class="view-home__feature-item-icon" aria-hidden="true">🛡️</span>
              <div>
                <h4 class="view-home__feature-title">{{ t("website.forPatients.nonInvasive.title") }}</h4>
                <p class="view-home__feature-desc">{{ t("website.forPatients.nonInvasive.desc") }}</p>
              </div>
            </li>
            <li class="view-home__feature-item">
              <span class="view-home__feature-item-icon" aria-hidden="true">⏱️</span>
              <div>
                <h4 class="view-home__feature-title">{{ t("website.forPatients.quick.title") }}</h4>
                <p class="view-home__feature-desc">{{ t("website.forPatients.quick.desc") }}</p>
              </div>
            </li>
            <li class="view-home__feature-item">
              <span class="view-home__feature-item-icon" aria-hidden="true">😊</span>
              <div>
                <h4 class="view-home__feature-title">{{ t("website.forPatients.health.title") }}</h4>
                <p class="view-home__feature-desc">{{ t("website.forPatients.health.desc") }}</p>
              </div>
            </li>
          </ul>
          <div class="view-home__section-cta view-home__section-cta--left">
            <a href="#cta" class="view-home__btn view-home__btn--primary">{{ t("website.forPatients.cta") }}</a>
          </div>
        </div>
        <div class="view-home__twocol-image">
          <img src="/images/for-patients.jpeg" alt="" class="view-home__img" width="560" height="400" />
        </div>
      </div>
    </section>

    <section id="cta" class="view-home__cta-banner">
      <div class="view-home__cta-banner-inner">
        <h2 class="view-home__cta-banner-heading">{{ t("website.cta.heading") }}</h2>
        <p class="view-home__cta-banner-subtitle">{{ t("website.cta.subtitle") }}</p>
        <div class="view-home__cta-banner-btns">
          <a href="#for-patients" class="view-home__btn view-home__btn--white-outline">
            {{ t("website.cta.getStarted") }}
            <span class="view-home__btn-arrow" aria-hidden="true">→</span>
          </a>
          <a href="#for-patients" class="view-home__btn view-home__btn--white-border">{{ t("website.cta.schedule") }}</a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useTheme } from "../composables/useTheme";

const { t } = useI18n();
const { isDark } = useTheme();
</script>

<style lang="scss" scoped>
.view-home {
  max-width: 100%;
}

.view-home__hero {
  padding: 3rem 1.5rem 4rem;
  position: relative;
  overflow: hidden;
}

.view-home__hero-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
}

.view-home__hero-images {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 420px;
  overflow: hidden;
  border-radius: calc(var(--website-radius) * 2);
  box-shadow: var(--website-shadow-md);
}

.view-home__hero-moon {
  position: absolute;
  right: -8%;
  top: 50%;
  transform: translateY(-50%);
  width: 200px;
  height: 200px;
  z-index: 0;
  opacity: 0;
  transition: opacity 0.6s ease, transform 0.6s ease;
  pointer-events: none;
}

.view-home--dark .view-home__hero-moon {
  opacity: 1;
}

.view-home__hero-moon-svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 32px rgba(255, 255, 255, 0.12));
}

.view-home__hero-image {
  position: relative;
  z-index: 1;
  display: block;
  object-fit: cover;
  object-position: center;
  border-radius: calc(var(--website-radius) * 2);
  transition: filter 0.4s ease;
}

.view-home--dark .view-home__hero-image {
  filter: brightness(0.88) contrast(1.05) saturate(0.92);
}

.view-home__hero-image--main {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 100%;
}

@media (max-width: 768px) {
  .view-home__hero-inner {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .view-home__hero-ctas {
    justify-content: center;
  }

  .view-home__hero-images {
    max-height: 320px;
    order: -1;
  }

  .view-home__hero-moon {
    right: -4%;
    width: 140px;
    height: 140px;
  }
}

.view-home__hero-title {
  font-size: clamp(2rem, 4.5vw, 2.75rem);
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
  display: flex;
  flex-direction: column;
  gap: 0.1em;
}

.view-home__hero-title-line1 {
  color: var(--website-text);
}

.view-home__hero-title-line2 {
  color: var(--website-primary);
}

.view-home__hero-subtitle {
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--website-text-secondary);
  margin: 0 0 2rem;
}

.view-home__hero-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.view-home__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: var(--website-btn-min-height);
  min-width: var(--website-btn-min-width);
  padding: 0 1.5rem;
  border-radius: var(--website-radius);
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: var(--website-shadow-sm);

  &--primary {
    background: var(--website-primary);
    color: #fff;
    border-radius: 9999px;

    &:hover {
      background: var(--website-primary-hover);
      color: #fff;
    }
  }

  &--secondary {
    background: transparent;
    color: var(--website-primary);
    border: 2px solid var(--website-primary);
    border-radius: 9999px;

    &:hover {
      background: rgba(18, 143, 131, 0.08);
    }
  }

  &--white-outline {
    background: #fff;
    color: var(--website-primary);
    border: 2px solid #fff;
    border-radius: 9999px;

    &:hover {
      background: rgba(255, 255, 255, 0.9);
      color: var(--website-primary-hover);
    }
  }

  &--white-border {
    background: transparent;
    color: #fff;
    border: 2px solid #fff;

    &:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
  }
}

.view-home__btn-arrow {
  font-size: 1.1em;
}

.view-home__stats {
  background: rgba(142, 214, 206, 0.25);
  padding: 2.5rem 1.5rem;
  border-top: 1px solid var(--website-border);
  border-bottom: 1px solid var(--website-border);
}

.view-home--dark .view-home__stats {
  background: rgba(18, 143, 131, 0.12);
}

.view-home__stats-inner {
  max-width: 1000px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
  text-align: center;
}

@media (max-width: 600px) {
  .view-home__stats-inner {
    grid-template-columns: repeat(2, 1fr);
  }
}

.view-home__stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--website-primary);
  margin-bottom: 0.25rem;
}

.view-home__stat-label {
  font-size: 0.875rem;
  color: var(--website-text-secondary);
  line-height: 1.4;
}

.view-home__section {
  padding: 3rem 1.5rem;
}

.view-home__solutions {
  background: rgba(142, 214, 206, 0.12);
}

.view-home--dark .view-home__solutions {
  background: rgba(18, 143, 131, 0.08);
}

.view-home__section-title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--website-primary);
  margin: 0 0 0.5rem;
}

.view-home__section-heading {
  font-size: clamp(1.5rem, 4vw, 1.75rem);
  font-weight: 700;
  margin: 0 0 0.75rem;
  color: var(--website-text);
}

.view-home__section-subtitle {
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--website-text-secondary);
  margin: 0 0 2rem;

  &--center {
    text-align: center;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
}

.view-home__cards--two {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
  max-width: 900px;
  margin: 0 auto 2rem;
}

@media (max-width: 768px) {
  .view-home__cards--two {
    grid-template-columns: 1fr;
  }
}

.view-home__card {
  background: var(--website-bg);
  border-radius: var(--website-radius);
  padding: 2rem;
  box-shadow: var(--website-shadow-sm);
  border: 1px solid var(--website-border);

  &--with-icon {
    position: relative;
  }
}

.view-home__card-icon {
  width: 48px;
  height: 48px;
  background: rgba(18, 143, 131, 0.12);
  color: var(--website-primary);
  border-radius: var(--website-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;

  svg {
    width: 24px;
    height: 24px;
  }
}

.view-home__card-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--website-text);
}

.view-home__card-desc {
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--website-text-secondary);
  margin: 0 0 1rem;
}

.view-home__list {
  margin: 0;
  padding: 0;
  list-style: none;

  &--checks {
    padding-left: 0;
    font-size: 0.9375rem;
    color: var(--website-text-secondary);
    line-height: 1.6;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;

      &::before {
        content: none;
      }
    }
  }
}

.view-home__check {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background: rgba(18, 143, 131, 0.2);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: "✓";
    color: var(--website-primary);
    font-size: 0.75rem;
    font-weight: 700;
  }
}

.view-home__twocol {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;

  &--image-left .view-home__twocol-image {
    order: -1;
  }
}

@media (max-width: 768px) {
  .view-home__twocol {
    grid-template-columns: 1fr;

    &--image-left .view-home__twocol-image {
      order: 0;
    }
  }
}

.view-home__twocol-image {
  border-radius: calc(var(--website-radius) * 2);
  overflow: hidden;
  box-shadow: var(--website-shadow-md);
}

.view-home__img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.view-home__grid--2x2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}

.view-home__feature-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  color: var(--website-text);
}

.view-home__feature-desc {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--website-text-secondary);
  margin: 0;
}

.view-home__feature-icon {
  font-size: 1.5rem;
  display: block;
  margin-bottom: 0.25rem;
}

.view-home__feature-list {
  list-style: none;
  margin: 0 0 1.5rem;
  padding: 0;
}

.view-home__feature-item {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.25rem;
  align-items: flex-start;
}

.view-home__feature-item-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  background: rgba(18, 143, 131, 0.12);
  border-radius: var(--website-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.view-home__section-cta {
  text-align: left;

  &--left {
    text-align: left;
  }
}

.view-home__cta-banner {
  background: var(--website-primary);
  padding: 4rem 1.5rem;
  text-align: center;
}

.view-home__cta-banner-inner {
  max-width: 640px;
  margin: 0 auto;
}

.view-home__cta-banner-heading {
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
}

.view-home__cta-banner-subtitle {
  font-size: 1.0625rem;
  color: rgba(255, 255, 255, 0.95);
  margin: 0 0 2rem;
  line-height: 1.6;
}

.view-home__cta-banner-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}
</style>
