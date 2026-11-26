<template>
  <div
    class="app-record-skeleton"
    :class="{ 'app-record-skeleton--shown': shown }"
    role="status"
    aria-live="polite"
    :aria-label="t('layout.loader.label')"
    data-testid="record-skeleton"
  >
    <div class="app-record-skeleton__tabs" aria-hidden="true">
      <span v-for="(w, i) in TAB_WIDTHS" :key="i" class="app-record-skeleton__bar app-record-skeleton__tab" :style="{ width: `${w}px`, '--i': i }" />
    </div>
    <div class="app-record-skeleton__fields" aria-hidden="true">
      <div v-for="(w, i) in FIELD_WIDTHS" :key="i" class="app-record-skeleton__field" :style="{ '--i': i + 2 }">
        <span class="app-record-skeleton__bar app-record-skeleton__label" />
        <span class="app-record-skeleton__bar app-record-skeleton__value" :style="{ width: `${w}%` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A record page's body while it loads (NEO-118): the shape of what is coming
 * (a row of tabs, label/value fields) breathing like the list skeleton rows,
 * in place of a spinner in an empty page. It stays invisible for the first
 * 200 ms so a fast load never flashes it.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const TAB_WIDTHS = [72, 64, 84, 58];
const FIELD_WIDTHS = [78, 62, 70, 54, 74, 60];
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
.app-record-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
  padding-block: var(--space-2, 8px) var(--space-6, 24px);
  opacity: 0;
  transition: opacity var(--pwa-fib-t-xl, 233ms) ease;
}

/* Bars inherit --i from their field, so a field's label and value breathe together. */

.app-record-skeleton--shown {
  opacity: 1;
}

.app-record-skeleton__tabs {
  display: flex;
  gap: var(--space-4, 16px);
  padding-bottom: var(--space-3, 12px);
  box-shadow: inset 0 -1px 0 var(--pwa-rule);
  overflow: hidden;
}

.app-record-skeleton__fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  max-width: 960px;
  gap: var(--space-5, 20px) var(--space-6, 24px);
}

.app-record-skeleton__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.app-record-skeleton__bar {
  display: block;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  animation: app-record-skeleton-breathe 1.6s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * 90ms);
}

.app-record-skeleton__tab {
  flex: none;
  height: 12px;
}

.app-record-skeleton__label {
  width: 36%;
  height: 9px;
}

.app-record-skeleton__value {
  height: 13px;
}

@keyframes app-record-skeleton-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-record-skeleton,
  .app-record-skeleton__bar {
    animation: none;
    transition: none;
  }
}
</style>
