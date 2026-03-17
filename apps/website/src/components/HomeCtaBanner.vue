<template>
  <section
    ref="sectionRef"
    class="home-cta-banner home-reveal"
    :class="{ 'home-reveal--visible': visible }"
  >
    <div class="page-container home-cta-banner__inner">
      <h2 class="home-cta-banner__heading">{{ t(config.headingKey) }}</h2>
      <p class="home-cta-banner__sub">{{ t(config.subtitleKey) }}</p>
      <div class="home-cta-banner__btns">
        <RouterLink
          v-for="btn in config.buttons"
          :key="btn.labelKey"
          :to="btn.to"
          class="home-btn"
          :class="`home-btn--${btn.variant}`"
        >
          {{ t(btn.labelKey) }}
          <span v-if="btn.arrow" class="home-btn__arrow" aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { ctaBannerConfig as config } from "../config/homeConfig";

const { t } = useI18n();
const sectionRef = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (!sectionRef.value) return;
  observer = new IntersectionObserver(
    ([e]) => { if (e?.isIntersecting) { visible.value = true; observer?.disconnect(); } },
    { threshold: 0.12 }
  );
  observer.observe(sectionRef.value);
});

onUnmounted(() => observer?.disconnect());
</script>

<style lang="scss" scoped>
$bp-mobile: 600px;

.home-cta-banner {
  background: var(--website-primary);
  margin: 0 var(--website-card-inset) 2.5rem;
  border-radius: var(--website-card-radius);

  @media (max-width: $bp-mobile) {
    margin: 0 0.75rem 2rem;
    border-radius: 14px;
  }
}

.home-cta-banner__inner {
  padding: 4rem 2rem;
  text-align: center;

  @media (max-width: $bp-mobile) { padding: 3rem 1.5rem; }
}

.home-cta-banner__heading {
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
  letter-spacing: -0.02em;
}

.home-cta-banner__sub {
  font-size: 1.0625rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.65;
  margin: 0 0 2rem;
}

.home-cta-banner__btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
  justify-content: center;
}
</style>
