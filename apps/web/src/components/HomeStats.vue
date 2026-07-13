<template>
  <section ref="sectionRef" class="home-stats" :class="{ 'home-stats--visible': visible }">
    <div class="home-stats__grid page-container">
      <div
        v-for="(stat, i) in display"
        :key="stat.labelKey"
        class="home-stat"
        :style="{ '--delay': `${i * 0.2}s` }"
      >
        <span class="home-stat__value">{{ stat.value }}</span>
        <span class="home-stat__label">{{ t(stat.labelKey) }}</span>
        <span class="home-stat__tooltip">{{ t('website.stats.sourcePrefix') }} {{ stat.source }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useCountUp } from "../composables/useCountUp";
import { homeStatsByLocale } from "../config/websiteContent";

const { t, locale } = useI18n();
const sectionRef = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

const currentStats = computed(() => homeStatsByLocale[locale.value] ?? homeStatsByLocale.en);

const countUps = homeStatsByLocale.en.map((_, i) =>
  useCountUp({
    target: currentStats.value[i]!.target,
    suffix: currentStats.value[i]!.suffix,
    duration: 2800,
    startWhen: visible,
  })
);

const display = computed(() =>
  currentStats.value.map((s, i) => ({
    labelKey: s.labelKey,
    source: s.source,
    value: countUps[i]!.displayValue.value,
  }))
);

onMounted(() => {
  if (!sectionRef.value) return;
  observer = new IntersectionObserver(
    ([e]) => { if (e?.isIntersecting) { visible.value = true; observer?.disconnect(); } },
    { threshold: 0.6 }
  );
  observer.observe(sectionRef.value);
});

onUnmounted(() => observer?.disconnect());
</script>

<style lang="scss" scoped>
$bp-mobile: 600px;

.home-stats {
  padding: 2.5rem 0;
  background: rgba(142, 214, 206, 0.25);
  border-top: 1px dashed var(--website-footer-card-border);
  border-bottom: 1px dashed var(--website-footer-card-border);

  [data-theme="dark"] & {
    background: rgba(18, 143, 131, 0.12);
  }
}

.home-stats__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
  text-align: center;

  @media (max-width: $bp-mobile) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }
}

.home-stat {
  position: relative;
  cursor: default;
  opacity: 0;
  transform: translateY(2.5rem) translateX(1.5rem);

  @media (max-width: $bp-mobile) {
    transform: translateY(2rem);
  }

  .home-stats--visible & {
    animation: stat-in 2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--delay, 0s);

    @media (max-width: $bp-mobile) {
      animation-name: stat-in-mobile;
    }
  }
}

@keyframes stat-in {
  0%   { opacity: 0;   transform: translateY(2.5rem) translateX(1.5rem) scale(0.88); }
  30%  { opacity: 0; }
  70%  { opacity: 1;   transform: translateY(0) translateX(0) scale(1.03); }
  100% { opacity: 1;   transform: translateY(0) translateX(0) scale(1); }
}

@keyframes stat-in-mobile {
  0%   { opacity: 0;   transform: translateY(2rem) scale(0.9); }
  30%  { opacity: 0; }
  70%  { opacity: 1;   transform: translateY(0) scale(1.03); }
  100% { opacity: 1;   transform: translateY(0) scale(1); }
}

.home-stat__value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--website-primary);
  margin-bottom: 0.25rem;
}

.home-stat__label {
  font-size: 0.875rem;
  color: var(--website-text-secondary);
  line-height: 1.4;
}

.home-stat__tooltip {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 50%;
  transform: translateX(-50%);
  background: var(--website-text, #1a1a2e);
  color: var(--website-bg, #fff);
  font-size: 0.7rem;
  white-space: nowrap;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease;
  z-index: 10;

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--website-text, #1a1a2e);
  }

  @media (max-width: $bp-mobile) {
    white-space: normal;
    width: max-content;
    max-width: 160px;
    text-align: center;
  }
}

.home-stat:hover .home-stat__tooltip {
  opacity: 1;
}
</style>
