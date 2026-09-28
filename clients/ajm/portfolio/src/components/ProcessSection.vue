<!-- Section 05 · Cómo trabajamos. Desktop: the section pins and scrolling moves the six stages sideways
     along one line that fills as you go; the stage on the line lights up. Phones and lite mode: the
     same stages as a vertical list with the line running down the side (no pinning). -->
<template>
  <section
    id="como-trabajamos"
    ref="root"
    class="process"
    :class="{ 'process--pinned': pinned }"
    :style="pinned ? { height: `${steps.length * 55 + 100}vh` } : undefined"
  >
    <div class="process__sticky">
      <header class="process__head">
        <p class="eyebrow">{{ t("process.eyebrow") }}</p>
        <h2 v-reveal class="process__title"><AccentText :text="t('process.title')" /></h2>
      </header>

      <div ref="viewport" class="process__viewport">
        <ol ref="track" class="track" :style="pinned ? { transform: `translate3d(${-shift}px, 0, 0)` } : undefined">
          <li class="track__line" aria-hidden="true"><i :style="{ transform: `scaleX(${fill})` }" /></li>
          <li
            v-for="(step, i) in steps"
            :key="step.name"
            v-reveal="{ delay: i * 60 }"
            class="step"
            :class="{ on: i <= current }"
          >
            <span class="step__dot" aria-hidden="true" />
            <span class="step__num">{{ String(i + 1).padStart(2, "0") }}</span>
            <span class="step__name">{{ step.name }}</span>
            <span class="step__body">{{ step.body }}</span>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useScrollProgress, vReveal } from "../lib/motion";

const props = defineProps<{ lite: boolean }>();
const { t, tm, rt } = useI18n();

type Msg = Parameters<typeof rt>[0];
const steps = computed(() =>
  (tm("process.steps") as { name: Msg; body: Msg }[]).map((s) => ({ name: rt(s.name), body: rt(s.body) })),
);

const root = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);

// Pin only where there is room and motion is welcome.
const wide = ref(false);
let mq: MediaQueryList | null = null;
const onMq = () => (wide.value = mq?.matches ?? false);
onMounted(() => {
  mq = window.matchMedia?.("(min-width: 861px)") ?? null;
  onMq();
  mq?.addEventListener("change", onMq);
  measure();
  // re-measure whenever the track or its window changes size (fonts loading, resize, layout switch)
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(measure);
    if (track.value) ro.observe(track.value);
    if (viewport.value) ro.observe(viewport.value);
  }
});
let ro: ResizeObserver | null = null;
onBeforeUnmount(() => {
  mq?.removeEventListener("change", onMq);
  ro?.disconnect();
});
const pinned = computed(() => wide.value && !props.lite);
watch(pinned, () => nextTick(measure));

const overflow = ref(0);
// a function declaration, so onMounted above can use it before this line runs
function measure() {
  if (!track.value || !viewport.value) return;
  overflow.value = Math.max(0, track.value.scrollWidth - viewport.value.clientWidth);
}

const progress = useScrollProgress(root);
const shift = computed(() => progress.value * overflow.value);
// vertical layout: the line is full; pinned: it fills with the scroll
const fill = computed(() => (pinned.value ? Math.max(0.02, progress.value) : 1));
const current = computed(() =>
  pinned.value ? Math.min(steps.value.length - 1, Math.floor(progress.value * steps.value.length)) : steps.value.length,
);
</script>

<style scoped>
.process {
  position: relative;
  padding: clamp(96px, 12vw, 160px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
}
.process--pinned {
  padding: 0;
}
.process--pinned .process__sticky {
  position: sticky;
  top: 0;
  height: 100svh;
  display: grid;
  grid-template-rows: auto 1fr;
  align-content: center;
  gap: clamp(40px, 6vh, 80px);
  padding: 0 var(--ajm-gutter);
  overflow: hidden;
}
.process__head {
  max-width: 900px;
  margin-bottom: 48px;
}
.process--pinned .process__head {
  margin: 0;
}
.process__title {
  margin: 12px 0 0;
  font: 500 clamp(32px, 4.6vw, 68px) / 1.02 var(--ajm-font);
  letter-spacing: -0.02em;
}
/* min-width: 0 keeps this grid item at the screen's width; otherwise it grows to the track's
   width and there is nothing left to scroll */
.process__viewport {
  min-width: 0;
  overflow: visible;
}
.track {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 32px;
}
.process--pinned .track {
  display: flex;
  gap: clamp(40px, 6vw, 96px);
  width: max-content;
  padding-right: 20vw;
  will-change: transform;
}
.track__line {
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 0;
  width: 1px;
  background: var(--ajm-line);
}
.track__line i {
  position: absolute;
  inset: 0;
  background: var(--ajm-ink);
  transform-origin: top;
}
.process--pinned .track__line {
  top: 5px;
  left: 0;
  right: 0;
  bottom: auto;
  width: auto;
  height: 1px;
}
.process--pinned .track__line i {
  transform-origin: left;
}
.step {
  position: relative;
  display: grid;
  gap: 10px;
  padding-left: 36px;
}
.process--pinned .step {
  width: clamp(260px, 26vw, 380px);
  padding: 44px 0 0;
}
.step__dot {
  position: absolute;
  left: 0;
  top: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px solid var(--ajm-ink);
  background: var(--ajm-paper);
  transition: background-color 0.4s ease, transform 0.5s var(--ajm-ease);
}
.step.on .step__dot {
  background: var(--ajm-ink);
  transform: scale(1.25);
}
.step__num {
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.16em;
  color: var(--ajm-muted);
}
.step__name {
  font: 500 clamp(28px, 3.4vw, 52px) / 1 var(--ajm-font);
  letter-spacing: -0.02em;
  color: var(--ajm-ink);
  transition: color 0.5s ease;
}
.process--pinned .step:not(.on) .step__name {
  color: var(--ajm-faint);
}
.step__body {
  max-width: 340px;
  font-size: 16px;
  color: var(--ajm-ink-soft);
}
</style>
