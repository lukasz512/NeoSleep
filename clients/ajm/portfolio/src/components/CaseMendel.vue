<!-- Case 04 · Mendel: one edited film, so the case is a highlight reel. The reel opens full-bleed from a
     narrow frame as it scrolls in, the figures count up over it, and three frames sit below it as a
     contact strip. All footage is from the text- and logo-free windows (encode-media.sh). -->
<template>
  <article id="mendel" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("mendel.number") }} · {{ t("mendel.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span><AccentText :text="t('mendel.title')" :stroke="3" /></span></span>
      </h3>
      <p class="case__tags">{{ t("mendel.tags") }}</p>
    </header>

    <div ref="reelEl" class="reel" :style="{ '--open': open }">
      <LoopVideo
        class="reel__video"
        :src="loopUrl('mendel/reel', lite)"
        :poster="picture(lite ? 'mendel/poster-640' : 'mendel/poster')"
        :label="t('mendel.videoLabel')"
        :play-label="t('media.play')"
        :lite="lite"
      />
      <div class="reel__scrim" />
      <ul ref="statsEl" class="stats">
        <li v-for="(s, i) in MENDEL_STATS" :key="s.key" class="stat" :style="{ '--i': i }">
          <span v-if="s.value !== null" class="stat__value">{{ counted(s.value) }}{{ s.suffix }}</span>
          <span class="stat__label">{{ t(`mendel.stats.${s.key}`) }}</span>
        </li>
      </ul>
    </div>

    <div class="reel__after">
      <p v-reveal class="case__body">{{ t("mendel.body") }}</p>
      <div class="strip">
        <picture v-for="(f, i) in ['f1', 'f2', 'f3']" :key="f" v-reveal="{ variant: 'wipe', delay: i * 110 }" class="strip__frame">
          <source :srcset="picture(`mendel/${f}`).avif" type="image/avif" />
          <img :src="picture(`mendel/${f}`).jpg" :alt="t('mendel.videoLabel')" loading="lazy" decoding="async" />
        </picture>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import { MENDEL_STATS } from "../content/cases";
import { loopUrl, picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { useScrollProgress, vReveal } from "../lib/motion";

const props = defineProps<{ lite: boolean }>();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");

// The reel widens from an inset frame to full bleed while it scrolls in.
const reelEl = ref<HTMLElement | null>(null);
const entering = useScrollProgress(reelEl, "enter");
const open = computed(() => (props.lite ? "1" : Math.min(1, entering.value * 1.35).toFixed(3)));

// Figures count up once, when the stats come into view (lite: shown final).
const statsEl = ref<HTMLElement | null>(null);
const statsSeen = useInView(statsEl, "-20%");
const t0 = ref(props.lite ? 1 : 0);
let raf = 0;
watch(statsSeen, (v) => {
  if (!v || props.lite) return;
  const start = performance.now();
  const step = (now: number) => {
    const x = Math.min(1, (now - start) / 1600);
    t0.value = 1 - Math.pow(1 - x, 3);
    if (x < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));
function counted(value: number): number {
  return Math.round(value * t0.value);
}
</script>

<style scoped>
.case {
  padding: clamp(72px, 10vw, 140px) 0;
  border-top: 1px solid var(--ajm-line);
}
.case__head {
  max-width: 900px;
  margin: 0 var(--ajm-gutter) clamp(32px, 5vw, 56px);
}
.case__title {
  margin: 12px 0 0.5em;
  font: 500 clamp(32px, 5vw, 72px) / 1 var(--ajm-font);
  letter-spacing: -0.02em;
}
.case__tags {
  margin: 0;
  color: var(--ajm-muted);
  font-size: 14px;
  letter-spacing: 0.04em;
}
.case__body {
  margin: 0;
  max-width: 620px;
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
}

.reel {
  position: relative;
  height: min(88svh, 62vw);
  min-height: 420px;
  overflow: hidden;
  color: var(--ajm-on-stage);
  /* inset frame → full bleed */
  clip-path: inset(0 calc((1 - var(--open, 1)) * 12vw) round calc((1 - var(--open, 1)) * 6px));
}
.reel__video,
.reel__video :deep(img),
.reel__video :deep(video) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.reel__scrim {
  position: absolute;
  inset: 0;
  background: rgba(20, 19, 17, 0.35);
}
.stats {
  position: absolute;
  left: var(--ajm-gutter);
  right: var(--ajm-gutter);
  bottom: clamp(24px, 4vw, 56px);
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px clamp(32px, 6vw, 96px);
  margin: 0;
  padding: 0;
  list-style: none;
}
.stat {
  display: grid;
  gap: 6px;
  align-content: end;
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 0.8s ease calc(var(--i) * 0.12s),
    transform 1s var(--ajm-ease) calc(var(--i) * 0.12s);
}
.is-in .stat {
  opacity: 1;
  transform: none;
}
.stat__value {
  font: italic 400 clamp(60px, 8.6vw, 136px) / 0.9 var(--ajm-display);
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.stat__label {
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(244, 241, 234, 0.85);
  white-space: nowrap;
}

.reel__after {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(24px, 5vw, 80px);
  align-items: start;
  padding: clamp(32px, 5vw, 64px) var(--ajm-gutter) 0;
}
.strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1vw, 14px);
}
.strip__frame {
  aspect-ratio: 4 / 3;
  overflow: hidden;
}
.strip__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (max-width: 760px) {
  .reel__after {
    grid-template-columns: 1fr;
  }
}
</style>
