<template>
  <span
    ref="triggerRef"
    class="nav-tooltip"
    :class="{ 'nav-tooltip--visible': visible }"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <Teleport to="body">
      <span
        v-show="visible"
        ref="bubbleRef"
        class="nav-tooltip__bubble"
        :style="bubbleStyle"
      >{{ text }}</span>
    </Teleport>
    <slot />
  </span>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";

defineProps<{ text: string }>();

const triggerRef = ref<HTMLElement | null>(null);
const bubbleRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const bubbleStyle = ref<{ top: string; left: string; transform: string }>({
  top: "0",
  left: "0",
  transform: "translateX(-50%)",
});

let showTimeout: ReturnType<typeof setTimeout> | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
const DELAY_MS = 400;
const GAP = 8;
const BUBBLE_MAX_WIDTH = 220;

function updatePosition() {
  const el = triggerRef.value;
  const bubble = bubbleRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  let left = rect.left + rect.width / 2;
  if (left - BUBBLE_MAX_WIDTH / 2 < GAP) left = GAP + BUBBLE_MAX_WIDTH / 2;
  if (left + BUBBLE_MAX_WIDTH / 2 > vw - GAP) left = vw - GAP - BUBBLE_MAX_WIDTH / 2;

  const bubbleHeight = bubble ? bubble.offsetHeight : 60;
  const spaceBelow = vh - (rect.bottom + GAP);
  const spaceAbove = rect.top - GAP;
  const showAbove = spaceBelow < bubbleHeight && spaceAbove >= spaceBelow;

  const top = showAbove
    ? `${rect.top - bubbleHeight - GAP}px`
    : `${rect.bottom + GAP}px`;

  bubbleStyle.value = {
    top,
    left: `${left}px`,
    transform: "translateX(-50%)",
  };
}

function show() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (showTimeout) return;
  showTimeout = setTimeout(() => {
    showTimeout = null;
    visible.value = true;
  }, DELAY_MS);
}

function hide() {
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }
  hideTimeout = setTimeout(() => {
    hideTimeout = null;
    visible.value = false;
  }, 100);
}

watch(visible, (v) => {
  if (v) {
    nextTick(() => {
      updatePosition();
      requestAnimationFrame(updatePosition);
    });
  }
});
</script>

<style lang="scss" scoped>
.nav-tooltip {
  position: relative;
  display: inline-flex;
}

.nav-tooltip__bubble {
  position: fixed;
  padding: 8px 12px;
  max-width: 220px;
  background: #1f2937;
  color: #fff;
  font-family: var(--website-font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: normal;
  word-wrap: break-word;
  border-radius: 6px;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

[data-theme="dark"] .nav-tooltip__bubble {
  background: #374151;
  color: #f3f4f6;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
}
</style>
