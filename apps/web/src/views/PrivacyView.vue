<template>
  <div class="view-privacy page-container">
    <div class="privacy-doc">
      <header class="privacy-doc__header">
        <p class="privacy-doc__eyebrow">{{ t('website.privacy.eyebrow') }}</p>
        <h1 class="privacy-doc__title">{{ t('website.privacy.title') }}</h1>
        <p class="privacy-doc__meta">{{ t('website.privacy.updated', { date: formattedDate }) }}</p>
        <p class="privacy-doc__intro">{{ t('website.privacy.intro', { company: entityConfig.companyName }) }}</p>
      </header>

      <div class="privacy-doc__sections">
        <section v-for="key in SECTIONS" :key="key" class="privacy-section">
          <h2 class="privacy-section__title">{{ t(`website.privacy.${key}.title`) }}</h2>
          <p class="privacy-section__body">{{ t(`website.privacy.${key}.body`, interpolationParams) }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { legalConfig } from '../config/websiteContent';
import { useSeoMeta } from '../composables/useSeoMeta';

const { t, locale } = useI18n();

useSeoMeta({ titleKey: 'website.seo.privacy.title', descriptionKey: 'website.seo.privacy.description', noindex: true });

// GDPR-grounded content for pl, LFPDPPP-grounded content for mx — genuinely
// different legal identity/authority per jurisdiction, not just a
// translation, so the interpolated params must follow the site's locale,
// not one shared config. en falls back to a generic EU-leaning default.
const SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] as const;

const entityConfig = computed(() => legalConfig[locale.value as 'en' | 'pl' | 'mx'] ?? legalConfig.en);

const interpolationParams = computed(() => ({
  company: entityConfig.value.companyName,
  legalEntityName: entityConfig.value.legalEntityName,
  email: entityConfig.value.privacyEmail,
  address: entityConfig.value.address,
  authorityName: entityConfig.value.authorityName,
  authorityUrl: entityConfig.value.authorityUrl,
}));

const formattedDate = computed(() =>
  new Date(legalConfig.lastUpdated).toLocaleDateString(locale.value, { year: 'numeric', month: 'long' })
);
</script>

<style lang="scss">
@layer components {
  .view-privacy {
    padding-top: 3rem;
    padding-bottom: 5rem;
  }

  .privacy-doc {
    max-width: 680px;
    margin: 0 auto;
  }

  .privacy-doc__header {
    margin-bottom: 3rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--website-border);
  }

  .privacy-doc__eyebrow {
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--website-primary);
    margin: 0 0 0.75rem;
  }

  .privacy-doc__title {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--website-text);
    margin: 0 0 0.5rem;
  }

  .privacy-doc__meta {
    font-size: 0.875rem;
    color: var(--website-text-secondary);
    margin: 0 0 1.25rem;
  }

  .privacy-doc__intro {
    font-size: 1.0625rem;
    line-height: 1.7;
    color: var(--website-text-secondary);
    margin: 0;
  }

  .privacy-doc__sections {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .privacy-section__title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 0 0 0.625rem;
  }

  .privacy-section__body {
    font-size: 0.9375rem;
    line-height: 1.75;
    color: var(--website-text-secondary);
    margin: 0;
  }
}
</style>
