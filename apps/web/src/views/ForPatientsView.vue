<template>
  <div class="view-for-patients">

    <!-- ── Hero ──────────────────────────────────────────────────────────── -->
    <TealBanner
      eyebrow-key="website.patientsPage.eyebrow"
      line1-key="website.patientsPage.heroTagline1"
      line2-key="website.patientsPage.heroTagline2"
      subtitle-key="website.patientsPage.heroSub"
      image-src="/images/cta-bg.jpg"
      image-position="right 57%"
    >
      <template #ctas>
        <RouterLink to="/find-specialist" class="home-btn home-btn--white-outline">
          {{ t("website.patientsPage.heroCta") }}
          <span class="home-btn__arrow" aria-hidden="true">→</span>
        </RouterLink>
        <a href="#how-it-works" class="home-btn home-btn--white-border">
          {{ t("website.patientsPage.heroCtaSecondary") }}
        </a>
      </template>
    </TealBanner>

    <!-- ── How it works ───────────────────────────────────────────────────── -->
    <section
      id="how-it-works"
      ref="howRef"
      class="home-section fp-how home-reveal"
      :class="{ 'home-reveal--visible': howVisible }"
    >
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.patientsPage.how.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.patientsPage.how.heading") }}</h2>
        <p class="home-sub home-sub--center">{{ t("website.patientsPage.how.sub") }}</p>
        <div class="fp-steps">
          <div class="fp-step">
            <span class="fp-step__num">{{ t("website.patientsPage.how.step1.num") }}</span>
            <h3 class="fp-step__title">{{ t("website.patientsPage.how.step1.title") }}</h3>
            <p class="fp-step__desc">{{ t("website.patientsPage.how.step1.desc") }}</p>
          </div>
          <div class="fp-step__connector" aria-hidden="true"></div>
          <div class="fp-step">
            <span class="fp-step__num">{{ t("website.patientsPage.how.step2.num") }}</span>
            <h3 class="fp-step__title">{{ t("website.patientsPage.how.step2.title") }}</h3>
            <p class="fp-step__desc">{{ t("website.patientsPage.how.step2.desc") }}</p>
          </div>
          <div class="fp-step__connector" aria-hidden="true"></div>
          <div class="fp-step">
            <span class="fp-step__num">{{ t("website.patientsPage.how.step3.num") }}</span>
            <h3 class="fp-step__title">{{ t("website.patientsPage.how.step3.title") }}</h3>
            <p class="fp-step__desc">{{ t("website.patientsPage.how.step3.desc") }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Benefits ───────────────────────────────────────────────────────── -->
    <section
      ref="benefitsRef"
      class="home-section fp-benefits home-reveal"
      :class="{ 'home-reveal--visible': benefitsVisible }"
    >
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.patientsPage.benefits.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.patientsPage.benefits.heading") }}</h2>
        <div class="fp-bcard-grid">

          <div class="fp-bcard">
            <div class="fp-bcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
              </svg>
            </div>
            <h3 class="fp-bcard__title">{{ t("website.patientsPage.benefits.noMachine.title") }}</h3>
            <p class="fp-bcard__desc">{{ t("website.patientsPage.benefits.noMachine.desc") }}</p>
          </div>

          <div class="fp-bcard">
            <div class="fp-bcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h3 class="fp-bcard__title">{{ t("website.patientsPage.benefits.proven.title") }}</h3>
            <p class="fp-bcard__desc">{{ t("website.patientsPage.benefits.proven.desc") }}</p>
          </div>

          <div class="fp-bcard">
            <div class="fp-bcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3 class="fp-bcard__title">{{ t("website.patientsPage.benefits.results.title") }}</h3>
            <p class="fp-bcard__desc">{{ t("website.patientsPage.benefits.results.desc") }}</p>
          </div>

          <div class="fp-bcard">
            <div class="fp-bcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.07 1.07L12 21.23l7.77-7.77 1.07-1.07a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h3 class="fp-bcard__title">{{ t("website.patientsPage.benefits.personal.title") }}</h3>
            <p class="fp-bcard__desc">{{ t("website.patientsPage.benefits.personal.desc") }}</p>
          </div>

        </div>
      </div>
    </section>

    <!-- ── Testimonials ───────────────────────────────────────────────────── -->
    <TestimonialsCarousel />

    <!-- ── CTA ────────────────────────────────────────────────────────────── -->
    <div
      ref="ctaRef"
      class="fp-cta-wrap home-reveal"
      :class="{ 'home-reveal--visible': ctaVisible }"
    >
      <div class="page-container">
        <TealBanner variant="cta" line1-key="website.patientsPage.cta.heading" subtitle-key="website.patientsPage.cta.sub">
          <template #ctas>
            <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="home-btn home-btn--white-outline">
              {{ t("website.patientsPage.cta.btn") }}
              <span class="home-btn__arrow" aria-hidden="true">→</span>
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
import TestimonialsCarousel from "../components/TestimonialsCarousel.vue";
import TealBanner from "../components/TealBanner.vue";
import { useReveal } from "../composables/useReveal";
import { useSeoMeta } from "../composables/useSeoMeta";

const { t } = useI18n();
useSeoMeta({ titleKey: "website.seo.forPatients.title", descriptionKey: "website.seo.forPatients.description" });

const howRef      = ref<HTMLElement | null>(null);
const benefitsRef = ref<HTMLElement | null>(null);
const ctaRef      = ref<HTMLElement | null>(null);

const howVisible      = useReveal(howRef,      0.08);
const benefitsVisible = useReveal(benefitsRef, 0.08);
const ctaVisible      = useReveal(ctaRef,      0.10);
</script>

<style lang="scss">
@layer components {
  /* ── How it works ────────────────────────────────────────────────────── */
  .fp-steps {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: start;
    margin-top: 3rem;
  }

  .fp-step {
    text-align: center;
    padding: 0 1.5rem;
  }

  .fp-step__connector {
    width: 48px;
    height: 2px;
    margin-top: 2.75rem;
    background: linear-gradient(90deg, var(--website-primary), var(--neosleep-light-teal));
    opacity: 0.45;
    align-self: start;
  }

  .fp-step__num {
    display: block;
    font-size: clamp(3rem, 6vw, 4.5rem);
    font-weight: 800;
    color: var(--website-primary);
    opacity: 0.22;
    line-height: 1;
    letter-spacing: -0.04em;
    margin-bottom: 0.5rem;
  }

  .fp-step__title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.625rem;
  }

  .fp-step__desc {
    font-size: 0.9375rem;
    line-height: 1.67;
    color: var(--website-text-secondary);
    margin: 0;
  }

  /* ── Benefits ────────────────────────────────────────────────────────── */
  .fp-benefits {
    background: rgba(142, 214, 206, 0.08);
    [data-theme="dark"] & { background: rgba(18, 143, 131, 0.07); }
  }

  .fp-bcard-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
    margin-top: 3rem;
  }

  .fp-bcard {
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
    padding: 2rem 1.75rem;
    box-shadow: var(--website-shadow-sm);
    transition: box-shadow 0.22s ease, transform 0.22s ease;

    &:hover {
      box-shadow: var(--website-shadow-md);
      transform: translateY(-3px);
    }
  }

  .fp-bcard__icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--website-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.25rem;

    svg {
      width: 22px;
      height: 22px;
      color: var(--website-icon-stroke);
    }
  }

  .fp-bcard__title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.5rem;
  }

  .fp-bcard__desc {
    font-size: 0.9375rem;
    line-height: 1.67;
    color: var(--website-text-secondary);
    margin: 0;
  }

  /* ── CTA ─────────────────────────────────────────────────────────────── */
  .fp-cta-wrap {
    padding-bottom: 2.5rem;
  }
}
</style>
