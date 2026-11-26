<template>
  <figure class="tmj-skull" :class="{ 'tmj-skull--mini': mini, 'tmj-skull--panel': !mini }" :aria-label="t('app.clinical.tmj.skullAria')">
    <svg viewBox="0 0 200 240" class="tmj-skull__svg" :class="`tmj-skull__svg--${look}`" role="img" aria-hidden="true">
      <defs>
        <filter :id="ids.wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" :scale="look === 'ink' ? 1.8 : 1.3" />
        </filter>
        <pattern :id="ids.hatchA" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="2.6" class="tmj-skull__hatch" />
        </pattern>
        <pattern :id="ids.hatchB" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)">
          <line x1="0" y1="0" x2="0" y2="3.4" class="tmj-skull__hatch tmj-skull__hatch--light" />
        </pattern>
        <filter :id="ids.blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4.5" /></filter>
      </defs>

      <!-- Construction lines, as in a study sketch: midline, brow, orbits, nose, bite, chin. -->
      <g v-if="!mini" class="tmj-skull__grid"><path v-for="d in GRID" :key="d" :d="d" /></g>

      <!-- Left half drawn, right half mirrored — a front view is symmetric. -->
      <g v-for="side in HALVES" :key="side" :transform="side === 'mirror' ? 'translate(200 0) scale(-1 1)' : undefined">
        <path class="tmj-skull__paper" :d="`${OUTLINE}L100 10Z`" />
        <path data-hatch :d="ORBIT" :fill="`url(#${ids.hatchA})`" class="tmj-skull__shade" />
        <path data-hatch :d="ORBIT_ROOF" :fill="`url(#${ids.hatchB})`" class="tmj-skull__shade" />
        <path data-hatch :d="NASAL" :fill="`url(#${ids.hatchA})`" class="tmj-skull__shade" />
        <path data-hatch :d="CHEEK_SHADOW" :fill="`url(#${ids.hatchB})`" class="tmj-skull__shade tmj-skull__shade--soft" />
        <path data-hatch :d="TEMPLE_SHADOW" :fill="`url(#${ids.hatchB})`" class="tmj-skull__shade tmj-skull__shade--soft" />
        <g :filter="`url(#${ids.wobble})`">
          <path class="tmj-skull__ink tmj-skull__ink--main" :d="OUTLINE" />
          <path class="tmj-skull__ink tmj-skull__ink--main tmj-skull__ink--again" :d="OUTLINE" />
          <path class="tmj-skull__ink" :d="ORBIT" />
          <path class="tmj-skull__ink tmj-skull__ink--again" :d="ORBIT" />
          <path class="tmj-skull__ink" :d="NASAL" />
          <path v-for="d in DETAIL" :key="d" class="tmj-skull__ink tmj-skull__ink--thin" :d="d" />
          <path v-for="d in TEETH" :key="d" class="tmj-skull__ink tmj-skull__ink--tooth" :d="d" />
        </g>
      </g>

      <!-- The joints: the patient's right is on the viewer's left in a front view. -->
      <g
        v-for="joint in JOINTS"
        :key="joint.side"
        :data-joint="joint.side"
        :data-level="levels[joint.side]"
        class="tmj-skull__joint"
        :class="{ 'tmj-skull__joint--on': levels[joint.side] > 0 }"
        :style="{ '--n': levels[joint.side] }"
      >
        <circle class="tmj-skull__halo" :cx="joint.x" :cy="JOINT_Y" :filter="`url(#${ids.blur})`" />
        <circle class="tmj-skull__dot" :cx="joint.x" :cy="JOINT_Y" r="5" />
        <text v-if="!mini" class="tmj-skull__label" :x="joint.labelX" :y="JOINT_Y + 4" text-anchor="middle">{{ t(joint.labelKey) }}</text>
      </g>
    </svg>
    <figcaption v-if="!mini" class="tmj-skull__caption">{{ caption }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { TMJ_FINDINGS, type TmjSide } from "../../config/questionnaires";

/**
 * Front-view skull for the ATM evaluation, drawn as a sketch (NEO-237): ink
 * lines through a slight turbulence wobble, hatched orbits / nasal aperture /
 * cheek hollows, faint construction lines — in the app's teal ink on a frosted
 * glass panel. Original drawing; only the anatomy and the study-sketch grid
 * were taken from Łukasz's reference. Each joint's glow grows with that side's
 * number of findings (0–5): size, opacity and colour ease between levels.
 * The patient's right joint is on the viewer's left (the doctor faces them).
 * `mini` drops the panel, grid, letters and caption — for the HC tab and the
 * patient card.
 */
const props = withDefaults(
  defineProps<{
    counts: Record<TmjSide, number>;
    mini?: boolean;
    look?: "ink" | "pencil";
  }>(),
  { mini: false, look: "ink" }
);
const { t } = useI18n();

const MAX_LEVEL = TMJ_FINDINGS.length;
const levels = computed<Record<TmjSide, number>>(() => ({
  right: Math.max(0, Math.min(MAX_LEVEL, props.counts.right)),
  left: Math.max(0, Math.min(MAX_LEVEL, props.counts.left)),
}));

// SVG ids must be unique per page — several skulls can be on screen at once.
const uid = useId();
const ids = { wobble: `${uid}-wobble`, hatchA: `${uid}-hatch-a`, hatchB: `${uid}-hatch-b`, blur: `${uid}-blur` };

const HALVES = ["left", "mirror"] as const;
const OUTLINE =
  "M100 10C62 9 32 33 29 74C27 98 31 114 37 125C30 128 26 136 28 145C30 152 37 156 44 157C41 173 41 191 48 204C58 221 78 231 100 233";
const ORBIT = "M96 85C86 76 62 75 50 82C44 91 46 105 55 114C65 122 82 121 90 113C96 105 98 95 96 85Z";
const ORBIT_ROOF = "M96 85C86 76 62 75 50 82C47 87 46 91 47 96C61 88 82 88 95 96C96 92 97 89 96 85Z";
const NASAL = "M100 117C95 120 88 131 87 145C87 154 93 160 100 160Z";
const CHEEK_SHADOW = "M44 157C50 166 55 178 58 190C56 200 52 206 48 204C42 190 41 172 44 157Z";
const TEMPLE_SHADOW = "M31 80C33 96 36 112 40 122C44 112 44 96 40 78C37 68 33 70 31 80Z";
const DETAIL = [
  "M43 87C56 71 80 68 98 80", // brow ridge
  "M35 66C47 46 70 34 100 31", // temporal line
  "M44 157C52 161 58 166 63 171", // zygoma → maxilla
  "M34 128C42 130 50 136 56 146", // cheekbone, lower edge
  "M64 171C76 175 88 177 100 177", // upper alveolar arch
  "M66 203C78 207 90 209 100 209", // lower alveolar arch
  "M60 30C66 44 70 60 70 74", // coronal suture
  "M100 160C98 166 98 171 100 177", // nasal spine → incisors
];
type Tooth = [x: number, y: number, w: number, h: number];
const UPPER: Tooth[] = [[94, 177, 6, 14], [87, 177, 6.2, 13], [80.5, 176.5, 5.6, 12], [75, 175.5, 4.8, 11.5], [70, 174, 4.4, 9.5], [65.5, 172.5, 4, 8.5]];
const LOWER: Tooth[] = [[94.5, 193, 5.2, 10.5], [88.5, 193, 5.2, 10.5], [83, 192.5, 5, 10], [78, 192, 4.6, 9.5], [73.5, 191, 4.2, 9], [69, 190, 4, 8.5]];
const tooth = ([x, y, w, h]: Tooth, upper: boolean) =>
  upper
    ? `M${x} ${y}L${x + 0.5} ${y + h - 2.5}Q${x + w / 2} ${y + h + 0.8} ${x + w - 0.5} ${y + h - 2.5}L${x + w} ${y}`
    : `M${x} ${y + h}L${x + 0.5} ${y + 2.5}Q${x + w / 2} ${y - 0.8} ${x + w - 0.5} ${y + 2.5}L${x + w} ${y + h}`;
const TEETH = [...UPPER.map((d) => tooth(d, true)), ...LOWER.map((d) => tooth(d, false))];
const GRID = ["M100 2V238", "M14 80H186", "M18 121H182", "M22 160H178", "M30 191H170", "M40 233H160", "M26 30V215", "M174 30V215"];

const JOINT_Y = 147;
const JOINTS: { side: TmjSide; x: number; labelX: number; labelKey: string }[] = [
  { side: "right", x: 29, labelX: 16, labelKey: "app.clinical.tmj.rightShort" },
  { side: "left", x: 171, labelX: 184, labelKey: "app.clinical.tmj.leftShort" },
];

const caption = computed(() => {
  const { right, left } = levels.value;
  return right || left ? t("app.clinical.tmj.counts", { right, left }) : t("app.clinical.tmj.markedNone");
});
</script>

<style scoped>
.tmj-skull {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 8px;
}
/* The frosted "liquid glass" panel the full-size skull sits on. */
.tmj-skull--panel {
  padding: 14px 12px 10px;
  border-radius: 22px;
  background: linear-gradient(160deg, rgba(var(--v-theme-surface), 0.78), rgba(var(--v-theme-primary), 0.07));
  border: 1px solid rgba(var(--v-theme-surface), 0.85);
  box-shadow: 0 10px 30px rgba(var(--v-theme-primary), 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
}
.tmj-skull__svg {
  width: 100%;
  max-width: 200px;
  height: auto;
  overflow: visible;
  --ink: rgb(var(--v-theme-on-surface));
}
.tmj-skull--mini .tmj-skull__svg {
  max-width: none;
}
.tmj-skull__grid path {
  fill: none;
  stroke: rgba(var(--v-theme-primary), 0.22);
  stroke-width: 0.6;
}
.tmj-skull__paper {
  fill: rgba(var(--v-theme-surface), 0.55);
}
.tmj-skull__ink {
  fill: none;
  stroke: var(--ink);
  stroke-width: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.62;
}
.tmj-skull__ink--main {
  stroke-width: 1.3;
  opacity: 0.75;
}
.tmj-skull__ink--again {
  transform: translate(0.6px, -0.4px);
  opacity: 0.32;
}
.tmj-skull__ink--thin {
  stroke-width: 0.75;
  opacity: 0.42;
}
.tmj-skull__ink--tooth {
  stroke-width: 0.8;
  opacity: 0.58;
}
.tmj-skull__hatch {
  stroke: var(--ink);
  stroke-width: 0.7;
}
.tmj-skull__hatch--light {
  stroke-width: 0.55;
}
.tmj-skull__shade {
  opacity: 0.55;
}
.tmj-skull__shade--soft {
  opacity: 0.22;
}
.tmj-skull__svg--pencil .tmj-skull__ink {
  stroke: rgb(var(--v-theme-primary));
}
.tmj-skull__svg--pencil .tmj-skull__shade {
  opacity: 0.32;
}
.tmj-skull__svg--pencil .tmj-skull__shade--soft {
  opacity: 0.13;
}
/* --n = findings on that side (0–5): the glow grows, deepens and turns redder, easing between levels. */
.tmj-skull__halo {
  r: calc(10px + var(--n) * 3px);
  fill: hsl(calc(6 - var(--n)) calc(62% + var(--n) * 5%) calc(70% - var(--n) * 5%));
  opacity: calc(min(1, var(--n)) * 0.14 + var(--n) * 0.14);
  transition: r 0.6s var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1)), opacity 0.6s var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1)), fill 0.6s ease;
}
.tmj-skull__dot {
  fill: rgba(var(--v-theme-surface), 0.92);
  stroke: rgba(var(--v-theme-on-surface), 0.3);
  stroke-width: 1.2;
  transition: fill 0.6s ease, stroke 0.6s ease;
}
.tmj-skull__joint--on .tmj-skull__dot {
  fill: hsl(calc(8 - var(--n) * 1.2) 72% calc(64% - var(--n) * 5%));
  stroke: rgba(255, 255, 255, 0.9);
}
.tmj-skull__label {
  font-size: 11px;
  font-weight: 600;
  fill: rgba(var(--v-theme-on-surface), 0.55);
  transition: fill 0.6s ease;
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
  .tmj-skull__halo,
  .tmj-skull__dot,
  .tmj-skull__label {
    transition: none;
  }
}
</style>
