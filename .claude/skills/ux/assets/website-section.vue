<!-- TEMPLATE: Website Section — eyebrow → heading → card grid → CTA
     CSS RULES (must follow):
     - NO <style scoped> — BEM class names for isolation
     - NO @media in component styles — responsive goes in website-responsive.scss
     - Wrap styles in @layer components { }
     - Use auto-fit/minmax for fluid grids (no breakpoints needed)
     - Use clamp() for fluid type sizing -->
<template>
  <section ref="sectionRef" class="home-section page-container home-reveal" :class="{ 'home-reveal--visible': visible }">
    <p class="home-eyebrow">{{ t('TODO.eyebrow') }}</p>
    <h2 class="home-heading">{{ t('TODO.heading') }}</h2>
    <p class="home-sub home-sub--center">{{ t('TODO.subtitle') }}</p>

    <div class="section-grid">
      <!-- TODO: replace with real items -->
      <div class="section-card">
        <div class="section-card__icon" aria-hidden="true">
          <!-- SVG icon: fill="none" stroke="currentColor" stroke-width="1.8" -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </div>
        <h3 class="section-card__title">{{ t('TODO.card.title') }}</h3>
        <p class="section-card__desc">{{ t('TODO.card.desc') }}</p>
      </div>
    </div>

    <div class="section-cta">
      <RouterLink to="/contact" class="home-btn home-btn--primary">
        {{ t('TODO.cta') }} <span aria-hidden="true">→</span>
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReveal } from '@shared/composables/useReveal'

const { t }      = useI18n()
const sectionRef = ref<HTMLElement | null>(null)
const visible    = useReveal(sectionRef, 0.08)
</script>

<style lang="scss">
@layer components {
  .section-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
    margin-top: 3rem;
  }
  .section-card {
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-card-radius);
    padding: 2rem 1.75rem;
    box-shadow: var(--website-shadow-sm);
    transition: box-shadow 0.22s ease, transform 0.22s ease;
    &:hover { box-shadow: var(--website-shadow-md); transform: translateY(-3px); }
    /* Liquid glass variant: background: rgba(255,255,255,0.08); backdrop-filter: blur(16px);
       border-color: rgba(255,255,255,0.12); box-shadow: 0 8px 32px rgba(0,0,0,0.12); */
  }
  .section-card__icon {
    width: 48px; height: 48px; border-radius: 12px;
    background: var(--website-icon-bg);
    display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;
    svg { width: 22px; height: 22px; color: var(--website-icon-stroke); }
  }
  .section-card__title { font-size: 1.0625rem; font-weight: 700; color: var(--website-text); margin: 0 0 0.5rem; }
  .section-card__desc  { font-size: 0.9375rem; line-height: 1.67; color: var(--website-text-secondary); margin: 0; }
  .section-cta         { display: flex; justify-content: center; margin-top: 3rem; }
}
</style>
