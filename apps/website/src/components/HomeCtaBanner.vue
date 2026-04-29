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
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import TealBanner from "./TealBanner.vue";
import { useReveal } from "@shared/composables/useReveal";
import { ctaBannerConfig as config } from "../config/websiteContent";

const { t } = useI18n();
const wrapRef = ref<HTMLElement | null>(null);
const visible = useReveal(wrapRef, 0.12);
</script>

<style lang="scss">
@layer components {
  .home-cta-banner {
    max-width: var(--website-page-max-width);
    margin: 0 auto 2.5rem;
  }
}
</style>
