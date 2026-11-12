<template>
  <div
    class="app-skeleton-lines"
    :class="{ 'app-skeleton-lines--shown': shown }"
    role="status"
    aria-live="polite"
    :aria-label="t('layout.loader.label')"
  >
    <span
      v-for="i in lines"
      :key="i"
      class="app-skeleton-lines__bar"
      aria-hidden="true"
      :style="{ width: `${WIDTHS[(i - 1) % WIDTHS.length]}%`, '--i': i - 1 }"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The in-dialog loading placeholder (CORE-195): a few breathing text lines,
 * the same look as AppRecordSkeleton, where the part of a dialog still
 * loading will appear. Replaces a centred spinner, which made an open dialog
 * jump from spinner height to content height. Invisible for the first
 * 200 ms so a fast load never flashes it.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

withDefaults(defineProps<{ lines?: number }>(), { lines: 3 });

const WIDTHS = [72, 88, 56, 80, 64];
const SHOW_AFTER_MS = 200;

const { t } = useI18n();
const shown = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  timer = setTimeout(() => (shown.value = true), SHOW_AFTER_MS);
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped>
.app-skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding-block: var(--space-2, 8px);
  opacity: 0;
  transition: opacity var(--pwa-fib-t-xl, 233ms) ease;
}

.app-skeleton-lines--shown {
  opacity: 1;
}

.app-skeleton-lines__bar {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  animation: app-skeleton-lines-breathe 1.6s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * 90ms);
}

@keyframes app-skeleton-lines-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-skeleton-lines,
  .app-skeleton-lines__bar {
    animation: none;
    transition: none;
  }
}
</style>
