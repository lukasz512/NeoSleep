<!-- Section 01. The entry's shutter opens onto this: the montage settles from a slight zoom,
     the headline rises line by line, the rest follows in a short stagger. On scroll the footage
     drifts slower than the page and the copy lifts away. -->
<template>
  <section id="top" class="hero" :class="{ 'is-in': ready }">
    <div v-parallax="0.3" class="hero__drift">
      <LoopVideo
        class="hero__media"
        :src="loopUrl('hero/loop', lite)"
        :poster="picture(lite ? 'hero/poster-640' : 'hero/poster')"
        :label="t('hero.kicker')"
        :play-label="t('media.play')"
        :lite="lite"
      />
    </div>
    <div class="hero__scrim" />
    <div class="hero__copy" :style="{ '--lift': lift }">
      <p v-if="greeting" class="hero__hello"><AccentText :text="`[${greeting}]`" /></p>
      <p class="eyebrow hero__kicker hero__step" style="--i: 0">{{ t("hero.kicker") }}</p>
      <h1 class="hero__title">
        <span class="mask-line"><span>{{ t("hero.line1") }}</span></span>
        <span class="mask-line"><span><AccentText :text="t('hero.line2')" /></span></span>
      </h1>
      <p class="hero__body hero__step" style="--i: 3">{{ t("hero.body") }}</p>
      <p class="hero__places hero__step" style="--i: 4">{{ t("hero.places") }}</p>
      <a class="hero__cta hero__step" style="--i: 5" href="#proyectos">
        {{ t("hero.cta") }} <span class="hero__arrow" aria-hidden="true">↓</span>
      </a>
    </div>
    <div class="hero__scroll" aria-hidden="true"><i /></div>
  </section>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import { loopUrl, picture } from "../lib/media";
import { vParallax } from "../lib/motion";

const props = defineProps<{ lite: boolean; ready: boolean; greeting?: string }>();
const { t } = useI18n();

// 0 → 1 over the first viewport of scrolling; the copy fades and lifts with it.
const scrollY = ref(0);
const lift = computed(() => (props.lite ? 0 : Math.min(1, scrollY.value / window.innerHeight)).toFixed(3));
function onScroll() {
  scrollY.value = window.scrollY;
}
onMounted(() => {
  if (props.lite) return;
  window.addEventListener("scroll", onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 100svh;
  display: grid;
  align-items: end;
  color: var(--ajm-on-stage);
  overflow: hidden;
  background: var(--ajm-stage);
}
.hero__drift {
  position: absolute;
  inset: 0;
  transform: translate3d(0, var(--py, 0), 0);
}
.hero__media {
  position: absolute;
  inset: 0;
  transform: scale(1.14);
  transition: transform 2.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.is-in .hero__media {
  transform: scale(1.02);
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
  padding: 0 var(--ajm-gutter) calc(56px + env(safe-area-inset-bottom));
  max-width: 1280px;
  opacity: calc(1 - var(--lift, 0) * 1.4);
  transform: translate3d(0, calc(var(--lift, 0) * -80px), 0);
}
.hero__step {
  opacity: 0;
  transform: translateY(14px);
  transition:
    opacity 0.8s ease calc(0.35s + var(--i) * 0.09s),
    transform 1s var(--ajm-ease) calc(0.35s + var(--i) * 0.09s);
}
.is-in .hero__step {
  opacity: 1;
  transform: none;
}
.hero__kicker {
  color: rgba(244, 241, 234, 0.8);
  margin: 0 0 18px;
}
/* CORE-59: the prospect's greeting, in the pen's hand, above the kicker */
.hero__hello {
  margin: 0 0 clamp(8px, 2vh, 20px);
  font: 400 clamp(20px, 2.4vw, 34px) / 1 var(--ajm-font);
}
.hero__title {
  margin: 0 0 24px;
  font: 500 clamp(36px, 6.2vw, 92px) / 1.02 var(--ajm-font);
  letter-spacing: -0.02em;
}
/* the pen word's low swash ran into the "r" of "bring": give it a little more room on the left */
.hero__title :deep(.acc) {
  margin-left: 0.06em;
}
.hero__title .mask-line > span {
  transition-duration: 1.1s;
  transition-delay: 0.15s;
}
.hero__title .mask-line:nth-child(2) > span {
  transition-delay: 0.27s;
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
.hero__arrow {
  display: inline-block;
  transition: transform 0.4s var(--ajm-ease);
}
.hero__cta:hover .hero__arrow {
  transform: translateY(4px);
}
/* a hairline that keeps running downwards: "there is more below" without an icon */
.hero__scroll {
  position: absolute;
  right: var(--ajm-gutter);
  bottom: calc(56px + env(safe-area-inset-bottom));
  width: 1px;
  height: 64px;
  overflow: hidden;
  background: rgba(244, 241, 234, 0.2);
  opacity: 0;
  transition: opacity 0.8s ease 1.2s;
}
.is-in .hero__scroll {
  opacity: 1;
}
.hero__scroll i {
  position: absolute;
  inset: 0;
  background: var(--ajm-on-stage);
  animation: run 2.2s var(--ajm-ease) infinite;
}
@keyframes run {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(100%);
  }
}
@media (max-width: 560px) {
  .hero__scroll {
    display: none;
  }
}
</style>
