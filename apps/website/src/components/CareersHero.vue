<template>
  <section class="ch">
    <div class="ch__bg" aria-hidden="true">
      <div class="ch__bg-circle ch__bg-circle--1" />
      <div class="ch__bg-circle ch__bg-circle--2" />
      <div class="ch__bg-grid" />
    </div>

    <div class="ch__inner page-container">
      <span class="ch__pill">
        <span class="ch__pill-dot" aria-hidden="true" />
        {{ jobListings.length }} {{ t('careers.hero.openPositions') }}
      </span>

      <h1 class="ch__title">
        {{ t('careers.hero.titleLine1') }}
        <span class="ch__title-accent">{{ t('careers.hero.titleLine2') }}</span>
      </h1>

      <p class="ch__subtitle">{{ t('careers.hero.subtitle') }}</p>

      <div class="ch__search-wrap">
        <label class="ch__search-label" :for="searchId">
          <svg class="ch__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </label>
        <input
          :id="searchId"
          v-model="query"
          type="search"
          class="ch__search"
          :placeholder="t('careers.hero.searchPlaceholder')"
          autocomplete="off"
          @input="$emit('search', query)"
        />
        <span v-if="query" class="ch__search-count">
          {{ resultsCount }} {{ t('careers.hero.results') }}
        </span>
      </div>

      <div class="ch__stats">
        <div v-for="stat in stats" :key="stat.labelKey" class="ch__stat">
          <span class="ch__stat-value">{{ stat.value }}</span>
          <span class="ch__stat-label">{{ t(stat.labelKey) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { jobListings, jobCities, jobCountries } from '../config/websiteContent'

const props = defineProps<{ resultsCount: number }>()
defineEmits<{ search: [q: string] }>()

const { t } = useI18n()
const query = ref('')
const searchId = 'careers-search'

const stats = computed(() => [
  { value: jobListings.length, labelKey: 'careers.stats.openRoles' },
  { value: jobCities.length,   labelKey: 'careers.stats.cities'    },
  { value: jobCountries.length,labelKey: 'careers.stats.countries' },
])
</script>

<style lang="scss">
@layer components {
  .ch {
    position: relative;
    overflow: hidden;
    padding: 5rem 0 4rem;
    background: var(--website-bg);
    /* responsive: @container main (max-width: 640px) → padding 3.5rem 0 3rem — in website-responsive.scss */
  }

  // ── Decorative background ────────────────────────────────────────────────────
  .ch__bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .ch__bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.07;
    background: var(--website-primary);

    &--1 {
      width: 600px; height: 600px;
      top: -200px; right: -150px;
    }
    &--2 {
      width: 400px; height: 400px;
      bottom: -180px; left: -100px;
      opacity: 0.04;
    }
  }

  .ch__bg-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--website-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--website-border) 1px, transparent 1px);
    background-size: 40px 40px;
    opacity: 0.4;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
  }

  // ── Content ───────────────────────────────────────────────────────────────────
  .ch__inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .ch__pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    border-radius: 999px;
    background: rgba(18, 143, 131, 0.1);
    border: 1px solid rgba(18, 143, 131, 0.25);
    color: var(--website-primary);
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin-bottom: 1.75rem;
  }

  .ch__pill-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--website-primary);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.75); }
  }

  .ch__title {
    font-size: clamp(2rem, 5vw, 3.25rem);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--website-text);
    margin: 0 0 1rem;
    max-width: 700px;
    display: flex;
    flex-direction: column;
    gap: 0.1em;
  }

  .ch__title-accent {
    color: var(--website-primary);
  }

  .ch__subtitle {
    font-size: 1.0625rem;
    line-height: 1.65;
    color: var(--website-text-secondary);
    max-width: 520px;
    margin: 0 0 2.5rem;
  }

  // ── Search ────────────────────────────────────────────────────────────────────
  .ch__search-wrap {
    position: relative;
    width: 100%;
    max-width: 520px;
    margin-bottom: 2.5rem;
  }

  .ch__search-label {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--website-text-secondary);
    display: flex;
    pointer-events: none;
  }

  .ch__search-icon {
    width: 18px; height: 18px;
  }

  .ch__search {
    width: 100%;
    padding: 0.875rem 3rem 0.875rem 2.875rem;
    border: 1.5px solid var(--website-border);
    border-radius: 999px;
    background: var(--website-bg);
    color: var(--website-text);
    font-size: 0.9375rem;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow: var(--website-shadow-sm);
    appearance: none;

    &::placeholder { color: var(--website-text-secondary); }

    &:focus {
      outline: none;
      border-color: var(--website-primary);
      box-shadow: 0 0 0 3px rgba(18, 143, 131, 0.12);
    }

    &::-webkit-search-cancel-button { cursor: pointer; }
  }

  .ch__search-count {
    position: absolute;
    right: 1.25rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8rem;
    color: var(--website-text-secondary);
    pointer-events: none;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  .ch__stats {
    display: flex;
    gap: 2.5rem;
    /* responsive: @container main (max-width: 640px) → gap 1.75rem — in website-responsive.scss */
  }

  .ch__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }

  .ch__stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--website-primary);
    line-height: 1;
  }

  .ch__stat-label {
    font-size: 0.75rem;
    color: var(--website-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }
}
</style>
