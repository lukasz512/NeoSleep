<template>
  <div class="view-for-professionals">

    <!-- ── Hero ──────────────────────────────────────────────────────────── -->
    <TealBanner
      eyebrow-key="website.dentistsPage.eyebrow"
      line1-key="website.dentistsPage.heroTagline1"
      line2-key="website.dentistsPage.heroTagline2"
      subtitle-key="website.dentistsPage.heroSub"
    >
      <template #ctas>
        <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-outline">
          {{ t("website.dentistsPage.heroCta") }}
          <span class="home-btn__arrow" aria-hidden="true">→</span>
        </RouterLink>
        <a href="#how-to-join" class="home-btn home-btn--white-border">
          {{ t("website.dentistsPage.heroCtaSecondary") }}
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
        <p class="home-eyebrow">{{ t("website.dentistsPage.why.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.dentistsPage.why.heading") }}</h2>
        <div class="fd-wcard-grid">

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.dentistsPage.why.expand.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.dentistsPage.why.expand.desc") }}</p>
          </div>

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.dentistsPage.why.training.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.dentistsPage.why.training.desc") }}</p>
          </div>

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.dentistsPage.why.platform.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.dentistsPage.why.platform.desc") }}</p>
          </div>

          <div class="fd-wcard">
            <div class="fd-wcard__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3 class="fd-wcard__title">{{ t("website.dentistsPage.why.outcomes.title") }}</h3>
            <p class="fd-wcard__desc">{{ t("website.dentistsPage.why.outcomes.desc") }}</p>
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
        <p class="home-eyebrow">{{ t("website.dentistsPage.how.eyebrow") }}</p>
        <h2 class="home-heading">{{ t("website.dentistsPage.how.heading") }}</h2>
        <p class="home-sub home-sub--center">{{ t("website.dentistsPage.how.sub") }}</p>
        <div class="fd-steps">
          <div class="fd-step">
            <span class="fd-step__num">{{ t("website.dentistsPage.how.step1.num") }}</span>
            <h3 class="fd-step__title">{{ t("website.dentistsPage.how.step1.title") }}</h3>
            <p class="fd-step__desc">{{ t("website.dentistsPage.how.step1.desc") }}</p>
          </div>
          <div class="fd-step__connector" aria-hidden="true"></div>
          <div class="fd-step">
            <span class="fd-step__num">{{ t("website.dentistsPage.how.step2.num") }}</span>
            <h3 class="fd-step__title">{{ t("website.dentistsPage.how.step2.title") }}</h3>
            <p class="fd-step__desc">{{ t("website.dentistsPage.how.step2.desc") }}</p>
          </div>
          <div class="fd-step__connector" aria-hidden="true"></div>
          <div class="fd-step">
            <span class="fd-step__num">{{ t("website.dentistsPage.how.step3.num") }}</span>
            <h3 class="fd-step__title">{{ t("website.dentistsPage.how.step3.title") }}</h3>
            <p class="fd-step__desc">{{ t("website.dentistsPage.how.step3.desc") }}</p>
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
          <p class="home-eyebrow">{{ t("website.dentistsPage.standards.eyebrow") }}</p>
          <h2 class="home-heading">{{ t("website.dentistsPage.standards.heading") }}</h2>
          <p class="fd-standards__body">{{ t("website.dentistsPage.standards.body") }}</p>
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
        <TealBanner variant="cta" line1-key="website.dentistsPage.cta.heading" subtitle-key="website.dentistsPage.cta.sub">
          <template #ctas>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-outline">
              {{ t("website.dentistsPage.cta.btn") }}
              <span class="home-btn__arrow" aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-border">
              {{ t("website.dentistsPage.cta.btnSecondary") }}
            </RouterLink>
          </template>
        </TealBanner>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import TealBanner from "../components/TealBanner.vue";

const { t } = useI18n();

const whyRef       = ref<HTMLElement | null>(null);
const howRef       = ref<HTMLElement | null>(null);
const standardsRef = ref<HTMLElement | null>(null);
const ctaRef       = ref<HTMLElement | null>(null);

const whyVisible       = ref(false);
const howVisible       = ref(false);
const standardsVisible = ref(false);
const ctaVisible       = ref(false);

let observers: IntersectionObserver[] = [];

onMounted(() => {
  const sections = [
    { el: whyRef.value,       visible: whyVisible,       threshold: 0.08 },
    { el: howRef.value,       visible: howVisible,       threshold: 0.08 },
    { el: standardsRef.value, visible: standardsVisible, threshold: 0.12 },
    { el: ctaRef.value,       visible: ctaVisible,       threshold: 0.10 },
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
$bp-mobile:  600px;

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

  @media (max-width: $bp-mobile) {
    grid-template-columns: 1fr;
  }
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

  @media (max-width: $bp-desktop) {
    grid-template-columns: 1fr;
    max-width: 480px;
    margin-inline: auto;
  }
}

.fd-step {
  text-align: center;
  padding: 0 1.5rem;

  @media (max-width: $bp-desktop) {
    padding: 1.5rem 0;
  }
}

.fd-step__connector {
  width: 48px;
  height: 2px;
  margin-top: 2.75rem;
  background: linear-gradient(90deg, var(--website-primary), var(--neosleep-light-teal));
  opacity: 0.45;
  align-self: start;

  @media (max-width: $bp-desktop) {
    display: none;
  }
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

  @media (max-width: $bp-mobile) {
    padding: 2rem 1.5rem;
  }
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

  @media (max-width: $bp-mobile) {
    padding-bottom: 1.5rem;
  }
}
</style>
