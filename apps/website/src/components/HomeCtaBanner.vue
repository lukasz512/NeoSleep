<template>
  <div
    ref="wrapRef"
    class="home-cta-banner home-reveal"
    :class="{ 'home-reveal--visible': visible }"
  >
    <div class="page-container">
      <TealBanner
        variant="cta"
        :line1-key="config.headingKey"
        :subtitle-key="config.subtitleKey"
      >
        <template #ctas>
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
        </template>
      </TealBanner>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import TealBanner from "./TealBanner.vue";
import { ctaBannerConfig as config } from "../config/homeConfig";

const { t } = useI18n();
const wrapRef = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (!wrapRef.value) return;
  observer = new IntersectionObserver(
    ([e]) => { if (e?.isIntersecting) { visible.value = true; observer?.disconnect(); } },
    { threshold: 0.12 }
  );
  observer.observe(wrapRef.value);
});

onUnmounted(() => observer?.disconnect());
</script>

<style lang="scss" scoped>
$bp-mobile: 600px;

.home-cta-banner {
  max-width: var(--website-page-max-width);
  margin: 0 auto 2.5rem;

  @media (max-width: $bp-mobile) {
    margin-bottom: var(--website-page-gutter-mobile);
  }
}
</style>
