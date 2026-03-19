<template>
  <div class="view-careers">

    <CareersHero :results-count="filtered.length" @search="onSearch" />

    <!-- Filters -->
    <section class="cv-filters page-container">
      <div class="cv-filter-group">
        <span class="cv-filter-label">{{ t('careers.filter.department') }}</span>
        <div class="cv-pills">
          <button
            class="cv-pill"
            :class="{ 'cv-pill--active': !activeDept }"
            @click="activeDept = null"
          >{{ t('careers.filter.all') }}</button>
          <button
            v-for="dept in jobDepartments"
            :key="dept"
            class="cv-pill"
            :class="{ 'cv-pill--active': activeDept === dept }"
            @click="activeDept = dept"
          >{{ t(`careers.dept.${dept}`) }}</button>
        </div>
      </div>

      <div class="cv-filter-group">
        <span class="cv-filter-label">{{ t('careers.filter.location') }}</span>
        <div class="cv-pills">
          <button
            class="cv-pill"
            :class="{ 'cv-pill--active': !activeCountry }"
            @click="activeCountry = null"
          >{{ t('careers.filter.allCountries') }}</button>
          <button
            v-for="country in jobCountries"
            :key="country"
            class="cv-pill"
            :class="{ 'cv-pill--active': activeCountry === country }"
            @click="activeCountry = country"
          >{{ country }}</button>
        </div>
      </div>
    </section>

    <!-- Results -->
    <section class="cv-results page-container">
      <p v-if="filtered.length === 0" class="cv-empty">
        {{ t('careers.noResults') }}
      </p>

      <TransitionGroup v-else name="cv-card" tag="div" class="cv-grid">
        <CareersJobCard
          v-for="job in filtered"
          :key="job.id"
          :job="job"
        />
      </TransitionGroup>
    </section>

    <!-- Bottom CTA -->
    <section class="cv-cta page-container">
      <div class="cv-cta__inner">
        <span class="home-eyebrow">{{ t('careers.cta.eyebrow') }}</span>
        <h2 class="cv-cta__heading">{{ t('careers.cta.heading') }}</h2>
        <p class="cv-cta__sub">{{ t('careers.cta.subtitle') }}</p>
        <RouterLink to="/contact" class="home-btn home-btn--primary">
          {{ t('careers.cta.button') }}
        </RouterLink>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CareersHero    from '../components/CareersHero.vue'
import CareersJobCard from '../components/CareersJobCard.vue'
import { jobListings, jobDepartments, jobCountries } from '../config/websiteContent'
import type { JobDepartment } from '../config/websiteContent'

const { t } = useI18n()

const searchQuery   = ref('')
const activeDept    = ref<JobDepartment | null>(null)
const activeCountry = ref<string | null>(null)

function onSearch(q: string) {
  searchQuery.value = q
}

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return jobListings.filter((job) => {
    if (activeDept.value    && job.department      !== activeDept.value)    return false
    if (activeCountry.value && job.locationCountry !== activeCountry.value) return false
    if (!q) return true
    return (
      t(job.titleKey).toLowerCase().includes(q) ||
      t(job.descKey).toLowerCase().includes(q)  ||
      job.locationCity.toLowerCase().includes(q)
    )
  })
})
</script>

<style lang="scss" scoped>
$bp: 640px;

.view-careers {
  padding-bottom: 5rem;
}

// ── Filters ───────────────────────────────────────────────────────────────────
.cv-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--website-border);
}

.cv-filter-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.cv-filter-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--website-text-secondary);
  white-space: nowrap;
  min-width: 80px;
}

.cv-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.cv-pill {
  padding: 0.375rem 0.875rem;
  border-radius: 999px;
  border: 1px solid var(--website-border);
  background: var(--website-bg);
  color: var(--website-text-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  outline: none;

  &:hover {
    border-color: var(--website-primary);
    color: var(--website-primary);
  }

  &:focus-visible {
    box-shadow: 0 0 0 3px rgba(18, 143, 131, 0.25);
    border-color: var(--website-primary);
  }

  &--active {
    background: var(--website-primary);
    border-color: var(--website-primary);
    color: #fff;
  }
}

// ── Grid ──────────────────────────────────────────────────────────────────────
.cv-results {
  padding-top: 2.5rem;
}

.cv-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;

  @media (max-width: 960px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: $bp)   { grid-template-columns: 1fr; }
}

.cv-empty {
  text-align: center;
  color: var(--website-text-secondary);
  padding: 4rem 0;
  font-size: 1rem;
}

// ── Card transition ───────────────────────────────────────────────────────────
.cv-card-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.cv-card-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; position: absolute; }
.cv-card-enter-from   { opacity: 0; transform: translateY(12px); }
.cv-card-leave-to     { opacity: 0; transform: translateY(-8px); }
.cv-card-move         { transition: transform 0.3s ease; }

// ── Bottom CTA ────────────────────────────────────────────────────────────────
.cv-cta {
  margin-top: 4rem;
}

.cv-cta__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3.5rem 2rem;
  background: rgba(18, 143, 131, 0.05);
  border: 1px solid rgba(18, 143, 131, 0.15);
  border-radius: 20px;
  gap: 0.5rem;
}

.cv-cta__heading {
  font-size: clamp(1.4rem, 3vw, 1.875rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--website-text);
  margin: 0.25rem 0 0.5rem;
}

.cv-cta__sub {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--website-text-secondary);
  max-width: 440px;
  margin: 0 0 1.25rem;
}
</style>
