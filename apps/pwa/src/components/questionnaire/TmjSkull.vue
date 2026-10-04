<template>
  <figure class="tmj-skull" :aria-label="t('app.clinical.tmj.skullAria')">
    <svg viewBox="0 0 200 224" class="tmj-skull__svg" role="img" aria-hidden="true">
      <!-- Front view, line art: cranium, eye sockets, nose, upper teeth, mandible. -->
      <path class="tmj-skull__bone" d="M100 10C57 10 28 42 28 86c0 24 7 40 16 51v14c0 9 7 15 16 15h80c9 0 16-6 16-15v-14c9-11 16-27 16-51 0-44-29-76-72-76Z" />
      <ellipse class="tmj-skull__line" cx="73" cy="94" rx="17" ry="14" />
      <ellipse class="tmj-skull__line" cx="127" cy="94" rx="17" ry="14" />
      <path class="tmj-skull__line" d="M100 108l-9 22c5 4 13 4 18 0Z" />
      <path class="tmj-skull__line" d="M72 152h56M80 146v12M90 145v13M100 145v13M110 145v13M120 146v12" />
      <path class="tmj-skull__bone" d="M50 150c0 30 20 58 50 62 30-4 50-32 50-62" />
      <path class="tmj-skull__line" d="M74 178h52M84 172v12M94 171v13M106 171v13M116 172v12" />
      <!-- The joints: the patient's right is on the viewer's left in a front view. -->
      <g v-for="joint in JOINTS" :key="joint.side" :data-joint="joint.side" class="tmj-skull__joint" :class="{ 'tmj-skull__joint--on': marked[joint.side] }">
        <circle class="tmj-skull__halo" :cx="joint.x" cy="142" r="15" />
        <circle class="tmj-skull__dot" :cx="joint.x" cy="142" r="8" />
        <text class="tmj-skull__label" :x="joint.x" y="172" text-anchor="middle">{{ t(joint.labelKey) }}</text>
      </g>
    </svg>
    <figcaption class="tmj-skull__caption">{{ caption }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { TmjSide } from "../../config/questionnaires";

/**
 * Front-view skull for the ATM evaluation (NEO-231 D3, Dra. Lorena's mockup):
 * each temporomandibular joint lights up when its side has a finding, so the
 * side reads at a glance. Drawn as the doctor faces the patient — the
 * patient's right joint is on the left of the drawing, labelled as such.
 */
const props = defineProps<{ marked: Record<TmjSide, boolean> }>();
const { t } = useI18n();

const JOINTS: { side: TmjSide; x: number; labelKey: string }[] = [
  { side: "right", x: 30, labelKey: "app.clinical.tmj.rightShort" },
  { side: "left", x: 170, labelKey: "app.clinical.tmj.leftShort" },
];

const caption = computed(() => {
  const { right, left } = props.marked;
  if (right && left) return t("app.clinical.tmj.markedBoth");
  if (right) return t("app.clinical.tmj.markedRight");
  if (left) return t("app.clinical.tmj.markedLeft");
  return t("app.clinical.tmj.markedNone");
});
</script>

<style scoped>
.tmj-skull {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 8px;
}
.tmj-skull__svg {
  width: 100%;
  max-width: 180px;
  height: auto;
  overflow: visible;
}
.tmj-skull__bone,
.tmj-skull__line {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.55);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tmj-skull__line {
  stroke-width: 1.6;
  stroke: rgba(var(--v-theme-on-surface), 0.38);
}
.tmj-skull__dot {
  fill: rgb(var(--v-theme-surface));
  stroke: rgba(var(--v-theme-on-surface), 0.45);
  stroke-width: 2;
  transition: fill 280ms ease, stroke 280ms ease;
}
.tmj-skull__halo {
  fill: rgba(var(--v-theme-error), 0.18);
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(0.6);
  transition: opacity 280ms ease, transform 280ms ease;
}
.tmj-skull__label {
  font-size: 13px;
  font-weight: 600;
  fill: rgba(var(--v-theme-on-surface), 0.6);
}
.tmj-skull__joint--on .tmj-skull__dot {
  fill: rgb(var(--v-theme-error));
  stroke: rgb(var(--v-theme-error));
}
.tmj-skull__joint--on .tmj-skull__halo {
  opacity: 1;
  transform: scale(1);
}
.tmj-skull__joint--on .tmj-skull__label {
  fill: rgb(var(--v-theme-error));
}
.tmj-skull__caption {
  font-size: 0.8125rem;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
@media (prefers-reduced-motion: reduce) {
  .tmj-skull__dot,
  .tmj-skull__halo {
    transition: none;
  }
}
</style>
