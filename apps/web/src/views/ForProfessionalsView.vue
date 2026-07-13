<template>
  <div class="view-for-professionals">

    <!-- ── Hero ──────────────────────────────────────────────────────────── -->
    <TealBanner
      eyebrow-key="website.professionalsPage.eyebrow"
      line1-key="website.professionalsPage.heroTagline1"
      line2-key="website.professionalsPage.heroTagline2"
      subtitle-key="website.professionalsPage.heroSub"
    >
      <template #ctas>
        <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-outline">
          {{ t("website.professionalsPage.heroCta") }}
          <span class="home-btn__arrow" aria-hidden="true">→</span>
        </RouterLink>
        <a href="#how-to-join" class="home-btn home-btn--white-border">
          {{ t("website.professionalsPage.heroCtaSecondary") }}
        </a>
      </template>
    </TealBanner>

    <!-- ── Why NeoSleep ───────────────────────────────────────────────────── -->
    <section
      ref="whyRef"
      class="home-section fd-why home-reveal"
      :class="{ 'home-reveal--visible': whyVisible }"
    >
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.professionalsPage.why.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.professionalsPage.why.heading") }}</h2>
        <div class="fd-wcard-grid">

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.professionalsPage.why.expand.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.professionalsPage.why.expand.desc") }}</p>
          </div>

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.professionalsPage.why.training.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.professionalsPage.why.training.desc") }}</p>
          </div>

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.professionalsPage.why.platform.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.professionalsPage.why.platform.desc") }}</p>
          </div>

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.professionalsPage.why.outcomes.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.professionalsPage.why.outcomes.desc") }}</p>
          </div>

        </div>
      </div>
    </section>

    <!-- ── How to join ────────────────────────────────────────────────────── -->
    <section
      id="how-to-join"
      ref="howRef"
      class="home-section fd-how home-reveal"
      :class="{ 'home-reveal--visible': howVisible }"
    >
      <div class="page-container">
        <p class="home-eyebrow">{{ t("website.professionalsPage.how.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.professionalsPage.how.heading") }}</h2>
        <p class="home-sub home-sub--center">{{ t("website.professionalsPage.how.sub") }}</p>
        <div class="fd-steps">
          <div class="fd-step">
            <span class="fd-step__num">{{ t("website.professionalsPage.how.step1.num") }}</span>
            <h3 class="fd-step__title">{{ t("website.professionalsPage.how.step1.title") }}</h3>
            <p class="fd-step__desc">{{ t("website.professionalsPage.how.step1.desc") }}</p>
          </div>
          <div class="fd-step__connector" aria-hidden="true"></div>
          <div class="fd-step">
            <span class="fd-step__num">{{ t("website.professionalsPage.how.step2.num") }}</span>
            <h3 class="fd-step__title">{{ t("website.professionalsPage.how.step2.title") }}</h3>
            <p class="fd-step__desc">{{ t("website.professionalsPage.how.step2.desc") }}</p>
          </div>
          <div class="fd-step__connector" aria-hidden="true"></div>
          <div class="fd-step">
            <span class="fd-step__num">{{ t("website.professionalsPage.how.step3.num") }}</span>
            <h3 class="fd-step__title">{{ t("website.professionalsPage.how.step3.title") }}</h3>
            <p class="fd-step__desc">{{ t("website.professionalsPage.how.step3.desc") }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Standards ──────────────────────────────────────────────────────── -->
    <section
      ref="standardsRef"
      class="home-section fd-standards home-reveal"
      :class="{ 'home-reveal--visible': standardsVisible }"
    >
      <div class="page-container">
        <div class="fd-standards__inner">
          <p class="home-eyebrow">{{ t("website.professionalsPage.standards.eyebrow") }}</p>
          <h2 class="home-heading">{{ t("website.professionalsPage.standards.heading") }}</h2>
          <p class="fd-standards__body">{{ t("website.professionalsPage.standards.body") }}</p>
        </div>
      </div>
    </section>

    <!-- ── CTA ────────────────────────────────────────────────────────────── -->
    <div
      ref="ctaRef"
      class="fd-cta-wrap home-reveal"
      :class="{ 'home-reveal--visible': ctaVisible }"
    >
      <div class="page-container">
        <TealBanner variant="cta" line1-key="website.professionalsPage.cta.heading" subtitle-key="website.professionalsPage.cta.sub">
          <template #ctas>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-outline">
              {{ t("website.professionalsPage.cta.btn") }}
              <span class="home-btn__arrow" aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-border">
              {{ t("website.professionalsPage.cta.btnSecondary") }}
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
import { useReveal } from "../composables/useReveal";
import { useSeoMeta } from "../composables/useSeoMeta";

const { t } = useI18n();
useSeoMeta({ titleKey: "website.seo.forProfessionals.title", descriptionKey: "website.seo.forProfessionals.description" });

const whyRef       = ref<HTMLElement | null>(null);
const howRef       = ref<HTMLElement | null>(null);
const standardsRef = ref<HTMLElement | null>(null);
const ctaRef       = ref<HTMLElement | null>(null);

const whyVisible       = useReveal(whyRef,       0.08);
const howVisible       = useReveal(howRef,       0.08);
const standardsVisible = useReveal(standardsRef, 0.12);
const ctaVisible       = useReveal(ctaRef,       0.10);
</script>

<style lang="scss">
@layer components {
  /* ── Why NeoSleep ────────────────────────────────────────────────────── */
  .fd-why {
    background: rgba(142, 214, 206, 0.08);
    [data-theme="dark"] & { background: rgba(18, 143, 131, 0.07); }
  }

  .fd-wcard-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
    margin-top: 3rem;
  }

  .fd-wcard {
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

  .fd-wcard__icon {
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

  .fd-wcard__title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.5rem;
  }

  .fd-wcard__desc {
    font-size: 0.9375rem;
    line-height: 1.67;
    color: var(--website-text-secondary);
    margin: 0;
  }

  /* ── How to join ─────────────────────────────────────────────────────── */
  .fd-steps {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: start;
    margin-top: 3rem;
  }

  .fd-step {
    text-align: center;
    padding: 0 1.5rem;
  }

  .fd-step__connector {
    width: 48px;
    height: 2px;
    margin-top: 2.75rem;
    background: linear-gradient(90deg, var(--website-primary), var(--neosleep-light-teal));
    opacity: 0.45;
    align-self: start;
  }

  .fd-step__num {
    display: block;
    font-size: clamp(3rem, 6vw, 4.5rem);
    font-weight: 800;
    color: var(--website-primary);
    opacity: 0.22;
    line-height: 1;
    letter-spacing: -0.04em;
    margin-bottom: 0.5rem;
  }

  .fd-step__title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.625rem;
  }

  .fd-step__desc {
    font-size: 0.9375rem;
    line-height: 1.67;
    color: var(--website-text-secondary);
    margin: 0;
  }

  /* ── Standards ───────────────────────────────────────────────────────── */
  .fd-standards__inner {
    max-width: 760px;
    margin: 0 auto;
    text-align: center;
    border: 1px solid var(--website-footer-card-border);
    border-radius: var(--website-card-radius);
    padding: 3rem 2.5rem;
  }

  .fd-standards__body {
    font-size: 1.0625rem;
    line-height: 1.78;
    color: var(--website-text-secondary);
    margin: 1.25rem 0 0;
  }

  /* ── CTA ─────────────────────────────────────────────────────────────── */
  .fd-cta-wrap {
    padding-bottom: 2.5rem;
  }
}
</style>
