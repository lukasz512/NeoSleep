<template>
  <div class="view-about">

    <!-- ── Hero ─────────────────────────────────────────────────────── -->
    <section class="ab-hero">
      <div class="ab-hero__inner page-container">
        <p class="ab-hero__eyebrow">{{ t("website.about.eyebrow") }}</p>
        <h1 class="ab-hero__tagline">
          <span class="ab-hero__tagline-l1">{{ t("website.about.heroTagline1") }}</span>
          <span class="ab-hero__tagline-l2">{{ t("website.about.heroTagline2") }}</span>
        </h1>
        <p class="ab-hero__sub">{{ t("website.about.heroSub") }}</p>
        <div class="ab-hero__ctas">
          <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="home-btn home-btn--white-outline">
            {{ t("website.about.cta.patient") }}
            <span class="home-btn__arrow" aria-hidden="true">→</span>
          </RouterLink>
          <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-border">
            {{ t("website.about.cta.dentist") }}
          </RouterLink>
        </div>
      </div>
    </section>

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
            <img src="/images/hero.jpeg" alt="" class="ab-mission__img" width="600" height="400" loading="lazy" />
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
            <span class="ab-stat__number">{{ t("website.about.stats.dentists") }}</span>
            <span class="ab-stat__label">{{ t("website.about.stats.dentistsLabel") }}</span>
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

    <!-- ── CTA ────────────────────────────────────────────────────────── -->
    <div ref="ctaRef" class="ab-cta-wrap home-reveal" :class="{ 'home-reveal--visible': ctaVisible }">
      <div class="page-container">
        <div class="ab-cta">
          <h2 class="ab-cta__heading">{{ t("website.about.cta.heading") }}</h2>
          <p class="ab-cta__sub">{{ t("website.about.cta.sub") }}</p>
          <div class="ab-cta__btns">
            <RouterLink :to="{ path: '/contact', query: { type: 'patient' } }" class="home-btn home-btn--white-outline">
              {{ t("website.about.cta.patient") }}
              <span class="home-btn__arrow" aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink :to="{ path: '/contact', query: { type: 'professional' } }" class="home-btn home-btn--white-border">
              {{ t("website.about.cta.dentist") }}
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const missionRef  = ref<HTMLElement | null>(null);
const valuesRef   = ref<HTMLElement | null>(null);
const statsRef    = ref<HTMLElement | null>(null);
const approachRef = ref<HTMLElement | null>(null);
const ctaRef      = ref<HTMLElement | null>(null);

const missionVisible  = ref(false);
const valuesVisible   = ref(false);
const statsVisible    = ref(false);
const approachVisible = ref(false);
const ctaVisible      = ref(false);

let observers: IntersectionObserver[] = [];

onMounted(() => {
  const sections = [
    { el: missionRef.value,  visible: missionVisible,  threshold: 0.10 },
    { el: valuesRef.value,   visible: valuesVisible,   threshold: 0.08 },
    { el: statsRef.value,    visible: statsVisible,    threshold: 0.15 },
    { el: approachRef.value, visible: approachVisible, threshold: 0.08 },
    { el: ctaRef.value,      visible: ctaVisible,      threshold: 0.10 },
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

/* ── Shared alignment override ──────────────────────────────────────── */
.ab-align-left {
  text-align: left;
  @media (max-width: $bp-desktop) { text-align: center; }
}

/* ── Hero ────────────────────────────────────────────────────────────── */
.ab-hero {
  background: linear-gradient(135deg, var(--neosleep-very-dark-teal) 0%, var(--neosleep-darker-teal) 100%);
  position: relative;
  overflow: hidden;

  /* decorative glow circles */
  &::before {
    content: "";
    position: absolute;
    width: 700px;
    height: 700px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(142, 214, 206, 0.14) 0%, transparent 65%);
    top: -260px;
    right: -140px;
    pointer-events: none;
  }
  &::after {
    content: "";
    position: absolute;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(142, 214, 206, 0.09) 0%, transparent 65%);
    bottom: -200px;
    left: 0;
    pointer-events: none;
  }
}

.ab-hero__inner {
  position: relative;
  z-index: 1;
  text-align: center;
  padding-top: 6rem;
  padding-bottom: 5.5rem;

  @media (max-width: $bp-desktop) {
    padding-top: 4.5rem;
    padding-bottom: 4rem;
  }
  @media (max-width: $bp-mobile) {
    padding-top: 3.5rem;
    padding-bottom: 3rem;
  }
}

.ab-hero__eyebrow {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--neosleep-light-teal);
  margin: 0 0 1.25rem;
}

.ab-hero__tagline {
  font-size: clamp(2.5rem, 6vw, 4rem);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.03em;
  margin: 0 auto 1.25rem;
  max-width: 820px;
  display: flex;
  flex-direction: column;
  gap: 0.06em;
}

.ab-hero__tagline-l1 { color: #fff; }
.ab-hero__tagline-l2 { color: var(--neosleep-light-teal); }

.ab-hero__sub {
  font-size: clamp(1rem, 2vw, 1.125rem);
  line-height: 1.72;
  color: rgba(255, 255, 255, 0.78);
  max-width: 620px;
  margin: 0 auto 2.5rem;
}

.ab-hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
  justify-content: center;
}

/* ── Mission ─────────────────────────────────────────────────────────── */
.ab-mission__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4.5rem;
  align-items: center;

  @media (max-width: $bp-desktop) {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}

.ab-mission__heading {
  display: flex;
  flex-direction: column;
  gap: 0.06em;
}

.ab-mission__heading-l1 { color: var(--website-text); }
.ab-mission__heading-l2 { color: var(--website-primary); }

.ab-mission__text {
  font-size: 1.0625rem;
  line-height: 1.78;
  color: var(--website-text-secondary);
  margin: 1rem 0 0;

  @media (max-width: $bp-desktop) { text-align: center; }
}

.ab-mission__media {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--website-shadow-md);
  height: clamp(280px, 40vw, 480px);

  @media (max-width: $bp-desktop) {
    order: -1;
    height: 260px;
    border-radius: 12px;
  }
  @media (max-width: $bp-mobile) {
    height: 210px;
    border-radius: 10px;
  }
}

.ab-mission__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
  display: block;

  [data-theme="dark"] & {
    filter: brightness(0.88) contrast(1.05) saturate(0.92);
  }
}

/* ── Values ──────────────────────────────────────────────────────────── */
.ab-values {
  background: rgba(142, 214, 206, 0.08);
  [data-theme="dark"] & { background: rgba(18, 143, 131, 0.07); }
}

.ab-vgrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
  margin-top: 3rem;

  @media (max-width: $bp-mobile) {
    grid-template-columns: 1fr;
  }
}

.ab-vcard {
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-radius);
  padding: 2rem 1.75rem;
  box-shadow: var(--website-shadow-sm);
  transition: box-shadow 0.22s ease, transform 0.22s ease;

  &:hover {
    box-shadow: var(--website-shadow-md);
    transform: translateY(-3px);
  }
}

.ab-vcard__icon {
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

.ab-vcard__title {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0 0 0.5rem;
}

.ab-vcard__desc {
  font-size: 0.9375rem;
  line-height: 1.67;
  color: var(--website-text-secondary);
  margin: 0;
}

/* ── Stats ───────────────────────────────────────────────────────────── */
.ab-stats {
  padding: 4rem 0;
}

.ab-stats__row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px dashed var(--website-footer-card-border);
  border-bottom: 1px dashed var(--website-footer-card-border);

  @media (max-width: $bp-mobile) {
    grid-template-columns: 1fr;
  }
}

.ab-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2.5rem 1.5rem;
  gap: 0.375rem;

  & + & {
    border-left: 1px dashed var(--website-footer-card-border);
    @media (max-width: $bp-mobile) {
      border-left: none;
      border-top: 1px dashed var(--website-footer-card-border);
    }
  }
}

.ab-stat__number {
  font-size: clamp(2.5rem, 5vw, 3.5rem);
  font-weight: 800;
  color: var(--website-primary);
  line-height: 1;
  letter-spacing: -0.03em;
}

.ab-stat__label {
  font-size: 0.9375rem;
  color: var(--website-text-secondary);
  line-height: 1.4;
  max-width: 160px;
  text-align: center;
}

/* ── Approach ────────────────────────────────────────────────────────── */
.ab-steps {
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

.ab-step {
  text-align: center;
  padding: 0 1.5rem;

  @media (max-width: $bp-desktop) {
    padding: 1.5rem 0;
  }
}

.ab-step__connector {
  width: 48px;
  height: 2px;
  margin-top: 2.75rem; /* align with centre of the large number */
  background: linear-gradient(90deg, var(--website-primary) 0%, var(--neosleep-light-teal) 100%);
  opacity: 0.45;
  align-self: start;

  @media (max-width: $bp-desktop) {
    display: none;
  }
}

.ab-step__num {
  display: block;
  font-size: clamp(3rem, 6vw, 4.5rem);
  font-weight: 800;
  color: var(--website-primary);
  opacity: 0.22;
  line-height: 1;
  letter-spacing: -0.04em;
  margin-bottom: 0.5rem;
}

.ab-step__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0 0 0.625rem;
}

.ab-step__desc {
  font-size: 0.9375rem;
  line-height: 1.67;
  color: var(--website-text-secondary);
  margin: 0;
}

/* ── CTA ─────────────────────────────────────────────────────────────── */
.ab-cta-wrap {
  padding-bottom: 2.5rem;

  @media (max-width: $bp-mobile) {
    padding-bottom: 1.5rem;
  }
}

.ab-cta {
  background: linear-gradient(135deg, var(--neosleep-very-dark-teal) 0%, var(--neosleep-darker-teal) 100%);
  border-radius: var(--website-card-radius);
  padding: 4.5rem 2rem;
  text-align: center;

  @media (max-width: $bp-mobile) {
    padding: 3rem 1.5rem;
    border-radius: 14px;
  }
}

.ab-cta__heading {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.625rem;
  letter-spacing: -0.025em;
}

.ab-cta__sub {
  font-size: 1.0625rem;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.78);
  max-width: 560px;
  margin: 0 auto 2.25rem;
}

.ab-cta__btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
  justify-content: center;
}
</style>
