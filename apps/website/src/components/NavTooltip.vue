<template>
  <span
    ref="triggerRef"
    class="nav-tooltip"
    :class="{ 'nav-tooltip--visible': visible }"
    @mouseenter="show"
    @mouseleave="hide"
  >
    <Teleport to="body">
      <span
        v-show="visible"
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
const visible = ref(false);
const bubbleStyle = ref<{ top: string; left: string; transform: string }>({
  top: "0",
  left: "0",
  transform: "translateX(-50%)",
});

let showTimeout: ReturnType<typeof setTimeout> | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
const DELAY_MS = 400;

function updatePosition() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const gap = 8;
  bubbleStyle.value = {
    top: `${rect.bottom + gap}px`,
    left: `${rect.left + rect.width / 2}px`,
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
  if (v) nextTick(updatePosition);
});
</script>

<style lang="scss" scoped>
.nav-tooltip {
  position: relative;
  display: inline-flex;
}

.nav-tooltip__bubble {
  position: fixed;
  padding: 6px 10px;
  background: #1f2937;
  color: #fff;
  font-family: var(--website-font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  border-radius: 6px;
  pointer-events: none;
  z-index: 9999;
}
</style>
