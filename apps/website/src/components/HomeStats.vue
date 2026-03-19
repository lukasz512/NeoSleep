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
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useCountUp } from "../composables/useCountUp";
import { homeStats } from "../config/websiteContent";

const { t } = useI18n();
const sectionRef = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

const countUps = homeStats.map((s) =>
  useCountUp({ target: s.target, suffix: s.suffix, duration: 2800, startWhen: visible })
);

const display = computed(() =>
  homeStats.map((s, i) => ({ labelKey: s.labelKey, value: countUps[i].displayValue.value }))
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
</style>
