<script setup lang="ts">
import { computed } from "vue";

/**
 * The NeoSleep wordmark as inline SVG, split into "NE", the O mark and
 * "SLEEP", so it can fold into its own O (NEO-108): when the app bar runs out
 * of room, NE and SLEEP slide into the O and fade, and the O grows to
 * `markSize` and glides to the leading edge. Unfolding plays it in reverse.
 *
 * Paths are copied from packages/brand/logos/logo/logo_light.svg (same
 * viewBox) — a tenant's own logo (app_config logo_url) is an opaque image and
 * cannot fold; AppLogo shows that one as a plain <img> instead.
 */
const props = withDefaults(
  defineProps<{
    folded?: boolean;
    dark?: boolean;
    /** Unfolded wordmark height, CSS px. */
    height?: number;
    /** Folded O width, CSS px (AppLayout: the avatar's size, so both bar corners match). */
    markSize?: number;
    alt?: string;
  }>(),
  { folded: false, dark: false, height: 28, markSize: 32, alt: "NeoSleep" },
);

// viewBox geometry (user units) of the source SVG.
const VIEW_X = 117;
const VIEW_W = 536;
const VIEW_H = 90;
const VIEW_CENTER_Y = 115;
const MARK_X = 250;
const MARK_W = 71;
const MARK_CENTER_Y = 118.5;

const style = computed(() => {
  const unit = props.height / VIEW_H;
  return {
    "--bwf-height": `${props.height}px`,
    "--bwf-width": `${VIEW_W * unit}px`,
    "--bwf-folded-width": `${props.markSize}px`,
    "--bwf-mark-shift-x": `${VIEW_X - MARK_X}px`,
    "--bwf-mark-shift-y": `${VIEW_CENTER_Y - MARK_CENTER_Y}px`,
    "--bwf-mark-scale": String(props.markSize / (MARK_W * unit)),
  };
});
</script>

<template>
  <span
    class="brand-wordmark-fold"
    :class="{ 'brand-wordmark-fold--folded': folded, 'brand-wordmark-fold--dark': dark }"
    :style="style"
    role="img"
    :aria-label="alt"
  >
    <svg class="brand-wordmark-fold__svg" viewBox="117 70 536 90" aria-hidden="true" focusable="false">
      <g class="brand-wordmark-fold__ne">
        <path d="M175.29,93.66v49h-9.89l-35.67-33.18v33.18h-11.92v-49h9.89l35.67,33.18v-33.18h11.92Z" />
        <path d="M239.36,135.04l2,7.63h-48.51v-49h47.22l-2,7.63h-33.21v12.74h31.23v7.49h-31.23v13.51h34.5Z" />
      </g>
      <g class="brand-wordmark-fold__sleep">
        <path d="M327.19,137.49l6.16-7.07c5.17,3.15,11.4,5.39,19.35,5.39,10.07,0,14.32-2.73,14.32-6.37,0-10.57-38.44-3.64-38.44-21.84,0-7.91,8.32-14.63,26.06-14.63,7.76,0,15.89,1.54,21.53,4.34l-5.790,7.07c-5.82-2.59-10.2-3.85-15.83-3.85-9.98,0-14.05,2.94-14.05,6.65,0,10.43,38.35,3.64,38.35,21.63,0,7.84-8.41,14.56-26.15,14.56-10.07,0-20.15-2.38-25.5-5.88Z" />
        <path d="M390.95,93.66h12.01v41.3h31.82l2,7.7h-45.83v-49Z" />
        <path d="M492.99,135.04l2,7.63h-48.51v-49h47.22l-2,7.63h-33.21v12.74h31.23v7.49h-31.23v13.51h34.5Z" />
        <path d="M555.09,135.04l2,7.63h-48.51v-49h47.22l-2,7.63h-33.21v12.74h31.23v7.49h-31.23v13.51h34.5Z" />
        <path d="M624.82,111.09c0,10.78-10.53,17.43-27.54,17.43h-14.6v14.14h-12.01v-49h26.61c17,0,27.54,6.58,27.54,17.43ZM612.71,111.09c0-6.16-5.45-9.73-15.99-9.73h-14.05v19.46h14.05c10.53,0,15.99-3.57,15.99-9.73Z" />
      </g>
      <g class="brand-wordmark-fold__mark">
        <path d="M313.69,98.78h-12.61c6.34,4.4,10.45,11.43,10.45,19.34,0,13.21-11.43,23.93-25.62,24.13h0s-.4,0-.4,0h-24.68c6.38,5.75,15.08,9.3,24.68,9.3,19.57,0,35.43-14.72,35.43-32.87,0-7.49-2.7-14.39-7.25-19.91Z" />
        <path
          class="brand-wordmark-fold__accent"
          d="M259.49,118.12c0-13.22,11.45-23.95,25.65-24.13v-.03h23.7c-6.23-5.06-14.39-8.14-23.33-8.14-19.57,0-35.43,14.72-35.43,32.87,0,6.97,2.35,13.43,6.34,18.75h13.5c-6.33-4.4-10.42-11.42-10.42-19.32Z"
        />
      </g>
    </svg>
  </span>
</template>

<style scoped>
/* Colours of logo_light.svg / logo_dark.svg: letters + grey arc (st1), teal arc (st0). */
.brand-wordmark-fold {
  --bwf-ink: #4a4a49;
  --bwf-accent: #009383;
  --bwf-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  display: block;
  flex: none;
  width: var(--bwf-width);
  height: var(--bwf-height);
  transition: width 420ms var(--bwf-ease) 40ms;
}

.brand-wordmark-fold--dark {
  --bwf-ink: #ffffff;
}

.brand-wordmark-fold__svg {
  display: block;
  width: var(--bwf-width);
  height: var(--bwf-height);
  /* The folded O grows past the viewBox's height. */
  overflow: visible;
  fill: var(--bwf-ink);
}

.brand-wordmark-fold__accent {
  fill: var(--bwf-accent);
}

.brand-wordmark-fold__ne,
.brand-wordmark-fold__sleep,
.brand-wordmark-fold__mark {
  transition:
    transform 420ms var(--bwf-ease),
    opacity 220ms ease;
}

/* Unfolding waits a beat so the bar's extra icons leave first. */
.brand-wordmark-fold:not(.brand-wordmark-fold--folded),
.brand-wordmark-fold:not(.brand-wordmark-fold--folded) g {
  transition-delay: 160ms;
}

/* Scale around the O's own left edge / vertical centre (user units). */
.brand-wordmark-fold__mark {
  transform-origin: 250px 118.5px;
  transition-delay: 40ms;
}

.brand-wordmark-fold--folded {
  width: var(--bwf-folded-width);
}

.brand-wordmark-fold--folded .brand-wordmark-fold__ne {
  transform: translateX(70px);
  opacity: 0;
}

.brand-wordmark-fold--folded .brand-wordmark-fold__sleep {
  transform: translateX(-90px);
  opacity: 0;
}

.brand-wordmark-fold--folded .brand-wordmark-fold__mark {
  transform: translate(var(--bwf-mark-shift-x), var(--bwf-mark-shift-y)) scale(var(--bwf-mark-scale));
}

@media (prefers-reduced-motion: reduce) {
  .brand-wordmark-fold,
  .brand-wordmark-fold g {
    transition-duration: 1ms !important;
    transition-delay: 0ms !important;
  }
}
</style>
