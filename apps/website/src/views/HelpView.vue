<template>
  <div class="view-help">
    <!-- Hero -->
    <section class="help-hero page-container">
      <p class="help-eyebrow">{{ t('website.help.eyebrow') }}</p>
      <h1 class="help-title">{{ t('website.help.title') }}</h1>
      <p class="help-subtitle">{{ t('website.help.subtitle') }}</p>
      <div class="help-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="search"
          v-model="query"
          :placeholder="t('website.help.search.placeholder')"
        />
      </div>
    </section>

    <!-- Category cards -->
    <section class="help-cats page-container">
      <div class="help-cats__grid">
        <button
          v-for="cat in helpCategories"
          :key="cat.id"
          class="help-cat"
          :class="{ 'help-cat--active': activeCategory === cat.id }"
          @click="toggleCategory(cat.id)"
        >
          <div class="help-cat__icon">
            <!-- condition: moon -->
            <svg v-if="cat.id === 'condition'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
            <!-- treatment: heartbeat/pulse -->
            <svg v-else-if="cat.id === 'treatment'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <!-- dentists: graduation cap -->
            <svg v-else-if="cat.id === 'dentists'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <!-- privacy: shield with check -->
            <svg v-else-if="cat.id === 'privacy'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h3 class="help-cat__title">{{ t(cat.titleKey) }}</h3>
          <p class="help-cat__desc">{{ t(cat.descKey) }}</p>
        </button>
      </div>
    </section>

    <!-- FAQ accordion -->
    <section class="help-faq page-container">
      <h2 class="help-faq__title">{{ t('website.help.faq.title') }}</h2>
      <p v-if="filteredFaqs.length === 0" class="help-faq__empty">
        {{ t('website.help.faq.noResults') }}
      </p>
      <div class="help-faq__list">
        <div
          v-for="faq in filteredFaqs"
          :key="faq.id"
          class="faq-item"
          :class="{ 'faq-item--open': openId === faq.id }"
        >
          <button class="faq-item__btn" @click="toggle(faq.id)">
            <span class="faq-item__cat-dot" :data-cat="faq.category"></span>
            <span class="faq-item__q">{{ t(faq.questionKey) }}</span>
            <span class="faq-item__chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </span>
          </button>
          <div class="faq-item__body">
            <div class="faq-item__body-inner">
              <div class="faq-item__body-content">{{ t(faq.answerKey) }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="help-cta page-container">
      <TealBanner variant="cta" line1-key="website.help.cta.heading" subtitle-key="website.help.cta.subtitle">
        <template #ctas>
          <RouterLink class="home-btn home-btn--white-outline" to="/contact">
            {{ t('website.help.cta.btn') }}
            <span class="home-btn__arrow">→</span>
          </RouterLink>
        </template>
      </TealBanner>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { helpCategories, helpFaqs } from '../config/websiteContent';
import type { HelpCategory } from '../config/websiteContent';
import TealBanner from '../components/TealBanner.vue';

const { t } = useI18n();

const openId = ref<string | null>(null);
const query = ref<string>('');
const activeCategory = ref<string | null>(null);

const filteredFaqs = computed(() => {
  let result = helpFaqs;

  if (activeCategory.value) {
    result = result.filter((faq) => faq.category === activeCategory.value);
  }

  if (query.value.trim()) {
    const q = query.value.toLowerCase();
    result = result.filter((faq) =>
      t(faq.questionKey).toLowerCase().includes(q)
    );
  }

  return result;
});

function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
}

function toggleCategory(id: HelpCategory['id']): void {
  activeCategory.value = activeCategory.value === id ? null : id;
}
</script>

<style lang="scss" scoped>
$bp-mobile: 600px;
$bp-tablet: 900px;

.view-help {
  padding-top: 3rem;
  padding-bottom: 5rem;

  @media (max-width: $bp-mobile) {
    padding-top: 1.5rem;
    padding-bottom: 2rem;
  }
}

// ── Hero ──────────────────────────────────────────────────────────────────────
.help-hero {
  text-align: center;
  margin-bottom: 4rem;
}

.help-eyebrow {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--website-primary);
  margin: 0 0 0.75rem;
}

.help-title {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--website-text);
  margin: 0 0 1rem;
}

.help-subtitle {
  font-size: 1.0625rem;
  color: var(--website-text-secondary);
  line-height: 1.65;
  margin: 0 auto 2rem;
  max-width: 520px;
}

.help-search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 480px;
  margin: 0 auto;
  padding: 0.875rem 1.25rem;
  background: var(--website-page-frame-bg);
  border: 1px solid var(--website-border);
  border-radius: 9999px;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--website-primary);
  }

  svg {
    width: 18px;
    height: 18px;
    color: var(--website-text-secondary);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.9375rem;
    font-family: inherit;
    color: var(--website-text);
    outline: none;

    &::placeholder {
      color: var(--website-text-secondary);
    }
  }
}

// ── Category cards ────────────────────────────────────────────────────────────
.help-cats {
  margin-bottom: 4rem;
}

.help-cats__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;

  @media (max-width: $bp-tablet) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: $bp-mobile) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }
}

.help-cat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.5rem;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: 16px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: inherit;

  @media (max-width: $bp-mobile) {
    padding: 1.125rem;
  }

  &:hover {
    border-color: var(--website-primary);
    box-shadow: 0 4px 16px rgba(18, 143, 131, 0.1);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--website-primary);
    box-shadow: 0 0 0 3px rgba(18, 143, 131, 0.2);
  }

  &--active {
    outline: none;
    border-color: var(--website-primary);
    background: rgba(18, 143, 131, 0.05);
  }
}

.help-cat__icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--website-icon-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;

  svg {
    width: 20px;
    height: 20px;
    color: var(--website-icon-stroke);
  }
}

.help-cat__title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0;
}

.help-cat__desc {
  font-size: 0.8125rem;
  color: var(--website-text-secondary);
  line-height: 1.5;
  margin: 0;
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
.help-faq__title {
  font-size: clamp(1.25rem, 3vw, 1.75rem);
  font-weight: 700;
  color: var(--website-text);
  margin: 0 0 2rem;
  text-align: center;
  letter-spacing: -0.02em;
}

.help-faq__empty {
  text-align: center;
  color: var(--website-text-secondary);
  padding: 3rem 0;
}

.help-faq__list {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.faq-item {
  border: 1px solid var(--website-border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;

  &--open {
    border-color: rgba(18, 143, 131, 0.4);
  }
}

.faq-item__btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.125rem 1.25rem;
  background: var(--website-bg);
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s;

  &:hover {
    background: var(--website-page-frame-bg);
  }
}

.faq-item__cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--website-primary);
  opacity: 0.5;

  .faq-item--open & {
    opacity: 1;
  }
}

.faq-item__q {
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--website-text);
  line-height: 1.4;
}

.faq-item__chevron {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--website-text-secondary);
  transition: transform 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
  }

  .faq-item--open & {
    transform: rotate(90deg);
  }
}

.faq-item__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.35s ease;

  .faq-item--open & {
    grid-template-rows: 1fr;
  }
}

.faq-item__body-inner {
  overflow: hidden;
}

.faq-item__body-content {
  padding: 0 1.25rem 1.25rem;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--website-text-secondary);
}

// ── CTA ───────────────────────────────────────────────────────────────────────
.help-cta {
  margin-top: 5rem;
}

.help-cta__inner {
  background: #0c6659;
  border-radius: var(--website-card-radius);
  padding: 4rem 2rem;
  text-align: center;

  @media (max-width: $bp-mobile) {
    padding: 3rem 1.75rem;
    border-radius: 14px;
  }
}

.help-cta__heading {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.75rem;
  letter-spacing: -0.02em;
}

.help-cta__sub {
  font-size: 1.0625rem;
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 2rem;
  line-height: 1.65;
}
</style>
