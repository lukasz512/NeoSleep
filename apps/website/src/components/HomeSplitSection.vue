<template>
  <section
    :id="section.id"
    ref="sectionRef"
    class="home-section home-reveal"
    :class="{ 'home-reveal--visible': visible }"
  >
    <div class="page-container">
      <div class="home-split" :class="{ 'home-split--img-left': section.imageLeft }">

        <div v-if="section.imageLeft" class="home-split__media">
          <div v-if="imgLoading" class="home-split__skeleton" aria-hidden="true" />
          <img v-else :src="section.imageSrc" alt="" class="home-split__photo" width="560" height="400" :style="section.imagePosition ? { objectPosition: section.imagePosition } : {}" />
        </div>

        <div class="home-split__body">
          <p class="home-eyebrow">{{ t(section.eyebrowKey) }}</p>
          <h2 class="home-heading">{{ t(section.headingKey) }}</h2>
          <p class="home-sub">{{ t(section.subtitleKey) }}</p>

          <div class="hss-grid">
            <div
              v-for="feat in section.features"
              :key="feat.id"
              :ref="(el) => captureFeature(feat, el as HTMLElement | null)"
              class="hss-feature"
            >
              <IconBox :feature-icon="true">
                <component :is="feat.icon" v-bind="feat.clockPatients ? { patients: true } : {}" />
              </IconBox>
              <div class="hss-feature__body">
                <h4 class="hss-feature__title">{{ t(feat.titleKey) }}</h4>
                <p class="hss-feature__desc">{{ t(feat.descKey) }}</p>
              </div>
            </div>
          </div>

          <div class="hss-cta">
            <RouterLink :to="section.ctaTo" class="home-btn home-btn--primary">
              {{ t(section.ctaKey) }}
            </RouterLink>
          </div>
        </div>

        <div v-if="!section.imageLeft" class="home-split__media">
          <div v-if="imgLoading" class="home-split__skeleton" aria-hidden="true" />
          <img v-else :src="section.imageSrc" alt="" class="home-split__photo" width="560" height="400" :style="section.imagePosition ? { objectPosition: section.imagePosition } : {}" />
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useImage } from "@vueuse/core";
import { IconBox } from "./icons";
import { useReveal } from "../composables/useReveal";
import type { SplitSectionConfig, FeatureItem } from "../config/websiteContent";

const props = defineProps<{ section: SplitSectionConfig }>();

const { t } = useI18n();
const { isLoading: imgLoading } = useImage(() => ({ src: props.section.imageSrc }));
const sectionRef = ref<HTMLElement | null>(null);
const visible    = useReveal(sectionRef, 0.12);
let cleanups: (() => void)[] = [];

function captureFeature(feat: FeatureItem, el: HTMLElement | null) {
  if (!el) return;
  if (feat.animId === "chart") setupChart(el);
  if (feat.clockPatients) setupClock(el);
}

function setupChart(el: HTMLElement) {
  const line  = el.querySelector<HTMLElement>(".view-home__icon-chart-line");
  const run   = () => el.classList.add("view-home__chart-revenue--draw");
  const onEnd = () => el.classList.remove("view-home__chart-revenue--draw");
  line?.addEventListener("animationend", onEnd);
  el.addEventListener("mouseenter", run);
  const obs = new IntersectionObserver(
    ([e]) => { if (e?.isIntersecting) { run(); obs.disconnect(); } },
    { threshold: 0.25 }
  );
  obs.observe(el);
  cleanups.push(() => {
    line?.removeEventListener("animationend", onEnd);
    el.removeEventListener("mouseenter", run);
    obs.disconnect();
  });
}

function setupClock(el: HTMLElement) {
  const hand = el.querySelector<HTMLElement>(".view-home__icon-clock-min-hand");
  if (!hand) return;
  const onEnd = (e: AnimationEvent) => {
    if (e.target !== hand) return;
    el.classList.remove("view-home__clock-rotating");
    el.classList.add("view-home__clock-done");
  };
  const onEnter = () => {
    el.classList.remove("view-home__clock-done", "view-home__clock-rotating");
    requestAnimationFrame(() => el.classList.add("view-home__clock-rotating"));
  };
  hand.addEventListener("animationend", onEnd);
  el.addEventListener("mouseenter", onEnter);
  cleanups.push(() => {
    hand.removeEventListener("animationend", onEnd);
    el.removeEventListener("mouseenter", onEnter);
  });
}

onUnmounted(() => cleanups.forEach((fn) => fn()));
</script>

<style lang="scss" scoped>
$bp-desktop: 960px;
$bp-mobile:  600px;

.home-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;

  @media (max-width: $bp-desktop) {
    grid-template-columns: 1fr;
    gap: 2rem;

    .home-split__media { order: -1; }
  }
}

.home-split__media {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--website-shadow-md);
  height: clamp(300px, 48vw, 560px);

  @media (max-width: $bp-desktop) { height: 260px; border-radius: 12px; }
  @media (max-width: $bp-mobile)  { height: 210px; border-radius: 10px; }
}

.home-split__photo {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center 30%;

  [data-theme="dark"] & {
    filter: brightness(0.88) contrast(1.05) saturate(0.92);
  }
}

@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}

.home-split__skeleton {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--website-surface-alt, #e8f0ef) 25%,
    var(--website-surface,     #f0f7f6) 50%,
    var(--website-surface-alt, #e8f0ef) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;

  [data-theme="dark"] & {
    background: linear-gradient(
      90deg,
      #1a2e2b 25%,
      #22403c 50%,
      #1a2e2b 75%
    );
    background-size: 200% 100%;
  }
}

.home-split__body {
  @media (max-width: $bp-desktop) { text-align: center; }
}

.hss-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.25rem;
  margin-bottom: 1.75rem;
  overflow: visible;

  @media (max-width: $bp-desktop) {
    grid-template-columns: 1fr;
    max-width: 460px;
    margin-inline: auto;
  }
}

.hss-feature {
  overflow: visible;

  @media (max-width: $bp-desktop) {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.875rem;
    text-align: left;
  }
}

.hss-feature__body {
  display: flex;
  flex-direction: column;
}

.hss-feature__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--website-text);
  margin: 0.5rem 0 0.2rem;

  @media (max-width: $bp-desktop) {
    margin-top: 0.25rem;
  }
}

.hss-feature__desc {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--website-text-secondary);
  margin: 0;
}

.hss-cta {
  @media (max-width: $bp-desktop) {
    display: flex;
    justify-content: center;
  }
}
</style>
