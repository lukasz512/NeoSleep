<template>
  <article class="cjc" :class="{ 'cjc--featured': job.featured }">
    <div class="cjc__accent" aria-hidden="true" />

    <header class="cjc__header">
      <span class="cjc__dept">
        <svg class="cjc__dept-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        {{ t(job.departmentKey) }}
      </span>
      <span v-if="job.featured" class="cjc__featured-badge">
        {{ t('careers.card.featured') }}
      </span>
    </header>

    <h3 class="cjc__title">{{ t(job.titleKey) }}</h3>

    <div class="cjc__meta">
      <span class="cjc__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        {{ job.locationCity }}, {{ job.locationCountry }}
      </span>
      <span class="cjc__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        {{ t(`careers.type.${job.type}`) }}
      </span>
      <span v-if="job.remote" class="cjc__meta-item cjc__meta-item--remote">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        {{ t('careers.card.remote') }}
      </span>
    </div>

    <p class="cjc__desc">{{ t(job.descKey) }}</p>

    <div class="cjc__tags">
      <span v-for="tag in job.tags" :key="tag" class="cjc__tag">{{ tag }}</span>
    </div>

    <footer class="cjc__footer">
      <span class="cjc__posted">{{ postedAgo }}</span>
      <a
        v-if="job.linkedInUrl"
        :href="job.linkedInUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="cjc__apply"
      >
        <svg class="cjc__li-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>
        </svg>
        {{ t('careers.card.apply') }}
      </a>
      <span v-else class="cjc__apply cjc__apply--soon">
        {{ t('careers.card.comingSoon') }}
      </span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { JobListing } from '../config/careersConfig'

const props = defineProps<{ job: JobListing }>()
const { t } = useI18n()

const postedAgo = computed(() => {
  const days = Math.floor((Date.now() - new Date(props.job.postedAt).getTime()) / 86_400_000)
  if (days === 0) return t('careers.card.today')
  if (days === 1) return t('careers.card.yesterday')
  return t('careers.card.daysAgo', { days })
})
</script>

<style lang="scss" scoped>
.cjc {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: 16px;
  padding: 1.5rem;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
  overflow: hidden;

  &:hover {
    box-shadow: var(--website-shadow-md);
    transform: translateY(-2px);
    border-color: rgba(18, 143, 131, 0.3);
  }

  &--featured {
    border-color: rgba(18, 143, 131, 0.25);
    box-shadow: 0 0 0 1px rgba(18, 143, 131, 0.1), var(--website-shadow-sm);
  }
}

// Bottom accent bar for featured
.cjc__accent {
  position: absolute;
  bottom: 0;
  left: 1.25rem;
  right: 1.25rem;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: transparent;
  transition: background 0.2s;

  .cjc--featured & {
    background: var(--website-primary);
  }
}

// ── Header row ────────────────────────────────────────────────────────────────
.cjc__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.cjc__dept {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--website-primary);
}

.cjc__dept-icon {
  width: 14px; height: 14px;
}

.cjc__featured-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--website-primary);
  background: rgba(18, 143, 131, 0.1);
  border: 1px solid rgba(18, 143, 131, 0.2);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

// ── Title ─────────────────────────────────────────────────────────────────────
.cjc__title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--website-text);
  line-height: 1.3;
  margin: 0 0 0.875rem;
  letter-spacing: -0.01em;
}

// ── Meta ──────────────────────────────────────────────────────────────────────
.cjc__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 0.875rem;
}

.cjc__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--website-text-secondary);

  svg { width: 13px; height: 13px; flex-shrink: 0; }

  &--remote { color: var(--website-primary); }
}

// ── Description ───────────────────────────────────────────────────────────────
.cjc__desc {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--website-text-secondary);
  margin: 0 0 1rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// ── Tags ──────────────────────────────────────────────────────────────────────
.cjc__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
}

.cjc__tag {
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  background: var(--website-border);
  color: var(--website-text-secondary);
  text-transform: lowercase;
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s;

  .cjc:hover & {
    background: rgba(18, 143, 131, 0.07);
    color: var(--website-primary);
    border-color: rgba(18, 143, 131, 0.15);
  }
}

// ── Footer ────────────────────────────────────────────────────────────────────
.cjc__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1rem;
  border-top: 1px solid var(--website-border);
  gap: 0.75rem;
}

.cjc__posted {
  font-size: 0.78rem;
  color: var(--website-text-secondary);
}

.cjc__apply {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.125rem;
  border-radius: 999px;
  background: #0a66c2;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s, transform 0.15s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover { background: #004182; transform: scale(1.03); }

  &--soon {
    background: var(--website-border);
    color: var(--website-text-secondary);
    cursor: default;
    &:hover { background: var(--website-border); transform: none; }
  }
}

.cjc__li-icon {
  width: 14px; height: 14px;
}
</style>
