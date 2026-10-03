<template>
  <component :is="tag" class="app-status-row" :class="[`app-status-row--${tone}`, { 'app-status-row--has-menu': $slots.menu }]">
    <span class="app-status-row__rail">
      <span class="app-status-row__icon" role="img" :aria-label="label">
        <AppIcon :name="ICON[tone]" />
      </span>
    </span>
    <div class="app-status-row__body">
      <div class="app-status-row__text"><slot /></div>
      <div v-if="$slots.actions" class="app-status-row__actions"><slot name="actions" /></div>
      <div v-if="$slots.menu" class="app-status-row__menu"><slot name="menu" /></div>
    </div>
  </component>
</template>

<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import type { StatusTone } from "../utils/statusTone";

/**
 * NEO-217: the Documentos row (rail + status icon + text + actions), shared so
 * every status list reads the same way. The shape carries the state, the
 * colour only backs it up: ○ missing · ◐ partial · ⏱ waiting · ✓ done ·
 * ! attention · ✕ cancelled. The ⋯ menu slot is always pinned to the right
 * edge, on a phone too.
 */
withDefaults(defineProps<{ tone: StatusTone; label: string; tag?: string }>(), { tag: "li" });

const ICON = {
  missing: "circle-outline",
  partial: "circle-half",
  waiting: "clock",
  done: "check-circle",
  attention: "alert-circle",
  cancelled: "x-circle",
} as const satisfies Record<StatusTone, string>;
</script>

<style scoped>
.app-status-row {
  --row-tone: rgba(var(--v-theme-on-surface), 0.45);
  --row-rail-bg: rgba(var(--v-theme-on-surface), 0.03);
  --row-rail-line: rgba(var(--v-border-color), var(--v-border-opacity));
  display: grid;
  grid-template-columns: 44px 1fr;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}
.app-status-row--partial,
.app-status-row--waiting {
  --row-tone: rgb(var(--v-theme-warning));
  --row-rail-bg: rgba(var(--v-theme-warning), 0.12);
  --row-rail-line: rgba(var(--v-theme-warning), 0.35);
}
.app-status-row--done {
  --row-tone: rgb(var(--v-theme-success));
  --row-rail-bg: rgba(var(--v-theme-success), 0.1);
  --row-rail-line: rgba(var(--v-theme-success), 0.35);
}
.app-status-row--attention {
  --row-tone: rgb(var(--v-theme-error));
  --row-rail-bg: rgba(var(--v-theme-error), 0.1);
  --row-rail-line: rgba(var(--v-theme-error), 0.35);
}
.app-status-row__rail {
  display: grid;
  place-items: center;
  background: var(--row-rail-bg);
  border-right: 1px solid var(--row-rail-line);
}
.app-status-row__icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  color: var(--row-tone);
}
.app-status-row__icon :deep(svg) {
  width: 100%;
  height: 100%;
}
.app-status-row__body {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px 12px;
  padding: 12px 8px 12px 16px;
}
.app-status-row__text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.app-status-row__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}
.app-status-row__menu {
  flex: none;
}

/* Phone: actions drop under the text, ⋯ stays at the top-right edge. */
@media (max-width: 599px) {
  .app-status-row {
    grid-template-columns: 36px 1fr;
  }
  .app-status-row__icon {
    width: 20px;
    height: 20px;
  }
  .app-status-row__body {
    flex-wrap: wrap;
    padding: 10px 4px 10px 12px;
  }
  .app-status-row__text {
    flex-basis: 100%;
  }
  .app-status-row--has-menu .app-status-row__text {
    padding-right: 40px;
  }
  .app-status-row__actions {
    flex-basis: 100%;
    margin-left: -8px;
  }
  .app-status-row__menu {
    position: absolute;
    top: 0;
    right: 0;
  }
}
</style>
