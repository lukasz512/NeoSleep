<template>
  <div class="deviation-diagram">
    <p class="deviation-diagram__label">{{ label }}</p>
    <div class="deviation-diagram__frame">
      <div class="deviation-diagram__half deviation-diagram__half--upper" :style="upperStyle" />
      <div class="deviation-diagram__half deviation-diagram__half--lower" :style="lowerStyle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * Replica of OrthoApnea's own "Desviación de la línea media" diagram
 * (teeth_medium_line_deviation.jpg, downloaded — see assets/orthoapnea/).
 * Confirmed real behavior (per user, reproduced from the live site): the
 * UPPER arch stays fixed as the reference and only the LOWER arch shifts
 * left/right as right/left values change — not a line drawn over a static
 * image. The source image is a single flat JPG with both arches (and the
 * midline marker) baked in, so this splits it into two halves via
 * background-position (upper half fixed, lower half's div translated
 * horizontally) rather than compositing separate upper/lower assets. The
 * midline marker is baked into each half already, so translating the lower
 * half also visibly offsets its half of the marker relative to the upper
 * half's — that offset IS the diagnostic "deviation" cue, same as OA's own
 * rendering. The exact mm-to-pixel mapping OrthoApnea uses internally isn't
 * confirmed (their Angular component's own formula wasn't captured) — this
 * is a reasonable approximation (±10mm maps to a modest, visually plausible
 * shift), not a verified match.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    right: number | null;
    left: number | null;
    size?: "normal" | "large";
  }>(),
  { size: "normal" }
);

const imgSrc = new URL("../../assets/orthoapnea/teeth/teeth_medium_line_deviation.jpg", import.meta.url).href;

// Source asset is 400x198 — scaled down to a fixed display width, half its
// height shown per arch.
const IMG_WIDTH = props.size === "large" ? 190 : 140;
const IMG_HEIGHT = Math.round((198 / 400) * IMG_WIDTH);
const HALF_HEIGHT = IMG_HEIGHT / 2;

const RANGE_MM = 10;
const MAX_SHIFT_PX = props.size === "large" ? 21 : 14;

const shiftPx = computed(() => {
  const delta = (props.right ?? 0) - (props.left ?? 0);
  const clamped = Math.max(-RANGE_MM, Math.min(RANGE_MM, delta));
  return (clamped / RANGE_MM) * MAX_SHIFT_PX;
});

const backgroundBase = {
  backgroundImage: `url(${imgSrc})`,
  backgroundRepeat: "no-repeat",
  backgroundSize: `${IMG_WIDTH}px ${IMG_HEIGHT}px`,
  width: `${IMG_WIDTH}px`,
  height: `${HALF_HEIGHT}px`,
};

const upperStyle = computed(() => ({ ...backgroundBase, backgroundPosition: "0 0" }));
const lowerStyle = computed(() => ({
  ...backgroundBase,
  backgroundPosition: `0 -${HALF_HEIGHT}px`,
  transform: `translateX(${shiftPx.value}px)`,
}));
</script>

<style scoped>
.deviation-diagram {
  text-align: center;
}

.deviation-diagram__label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-bottom: 4px;
}

.deviation-diagram__frame {
  display: inline-flex;
  flex-direction: column;
  overflow: hidden;
}

.deviation-diagram__half--lower {
  transition: transform 0.15s ease;
}
</style>
