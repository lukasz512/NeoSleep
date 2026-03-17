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
          <img :src="section.imageSrc" alt="" class="home-split__photo" width="560" height="400" :style="section.imagePosition ? { objectPosition: section.imagePosition } : {}" />
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
          <img :src="section.imageSrc" alt="" class="home-split__photo" width="560" height="400" :style="section.imagePosition ? { objectPosition: section.imagePosition } : {}" />
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { IconBox } from "./icons";
import type { SplitSectionConfig, FeatureItem } from "../config/homeConfig";

defineProps<{ section: SplitSectionConfig }>();

const { t } = useI18n();
const sectionRef = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;
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

onMounted(() => {
  if (!sectionRef.value) return;
  observer = new IntersectionObserver(
    ([e]) => { if (e?.isIntersecting) { visible.value = true; observer?.disconnect(); } },
    { threshold: 0.12 }
  );
  observer.observe(sectionRef.value);
});

onUnmounted(() => {
  observer?.disconnect();
  cleanups.forEach((fn) => fn());
});
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
