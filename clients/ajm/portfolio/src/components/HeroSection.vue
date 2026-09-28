<template>
  <section id="top" ref="root" class="hero" :class="{ 'is-in': ready }">
    <LoopVideo
      class="hero__media"
      :src="loopUrl('hero/loop', lite)"
      :poster="picture(lite ? 'hero/poster-640' : 'hero/poster')"
      :label="t('hero.kicker')"
      :play-label="t('media.play')"
      :lite="lite"
    />
    <div class="hero__scrim" />
    <div class="hero__copy">
      <p class="eyebrow hero__kicker">{{ t("hero.kicker") }}</p>
      <h1 class="hero__title">
        <span class="mask-line"><span>{{ t("hero.line1") }}</span></span>
        <span class="mask-line"><span>{{ t("hero.line2") }}</span></span>
      </h1>
      <p class="hero__body">{{ t("hero.body") }}</p>
      <p class="hero__places">{{ t("hero.places") }}</p>
      <a class="hero__cta" href="#proyectos">{{ t("hero.cta") }} <span aria-hidden="true">↓</span></a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import { loopUrl, picture } from "../lib/media";

defineProps<{ lite: boolean; ready: boolean }>();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 100svh;
  display: grid;
  align-items: end;
  color: var(--ajm-paper);
  overflow: hidden;
}
.hero__media {
  position: absolute;
  inset: 0;
}
.hero__media :deep(img),
.hero__media :deep(video) {
  height: 100svh;
}
.hero__scrim {
  position: absolute;
  inset: 0;
  background: rgba(20, 19, 17, 0.42);
}
.hero__copy {
  position: relative;
  padding: 0 var(--ajm-gutter) calc(48px + env(safe-area-inset-bottom));
  max-width: 1280px;
}
.hero__kicker {
  color: rgba(244, 241, 234, 0.8);
  margin: 0 0 18px;
}
.hero__title {
  margin: 0 0 24px;
  font: 500 clamp(36px, 6.2vw, 92px) / 1.02 var(--ajm-font);
  letter-spacing: -0.02em;
}
.hero__body {
  max-width: 560px;
  margin: 0 0 16px;
  font-size: clamp(16px, 1.4vw, 19px);
  color: rgba(244, 241, 234, 0.88);
}
.hero__places {
  margin: 0 0 32px;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: rgba(244, 241, 234, 0.7);
}
.hero__cta {
  display: inline-flex;
  gap: 10px;
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  border-bottom: 1px solid currentColor;
  padding-bottom: 6px;
}
</style>
