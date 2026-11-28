<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import GlobalSearchPalette from "./GlobalSearchPalette.vue";
import { useSearchShortcut } from "../composables/useSearchShortcut";

const { t } = useI18n();
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform ?? "");

function setOpen(value: boolean): void {
  open.value = value;
  if (!value) void nextTick(() => trigger.value?.focus());
}

useSearchShortcut({
  toggle: () => setOpen(!open.value),
  open: () => setOpen(true),
});
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="gs-trigger"
    data-testid="gs-trigger"
    aria-haspopup="dialog"
    :aria-expanded="open ? 'true' : 'false'"
    :aria-label="t('search.trigger')"
    @click="setOpen(true)"
  >
    <AppIcon name="search" aria-hidden="true" />
    <span class="gs-trigger-text">{{ t("search.trigger") }}</span>
    <kbd class="gs-trigger-chip" aria-hidden="true">{{ isMac ? "⌘K" : "Ctrl K" }}</kbd>
  </button>
  <GlobalSearchPalette :open="open" @update:open="setOpen" />
</template>

<style scoped>
.gs-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.gs-trigger:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.gs-trigger-text,
.gs-trigger-chip {
  display: none;
}
@media (min-width: 768px) {
  .gs-trigger {
    width: 240px;
    height: 36px;
    padding: 0 12px;
    justify-content: flex-start;
    border: 1px solid rgb(var(--v-theme-on-surface) / 0.16);
    background: rgb(var(--v-theme-on-surface) / 0.04);
  }
  .gs-trigger-text {
    display: inline;
    flex: 1;
    text-align: left;
    opacity: 0.6;
  }
  .gs-trigger-chip {
    display: inline;
    padding: 0 4px;
    border-radius: 4px;
    background: rgb(var(--v-theme-on-surface) / 0.08);
    font: inherit;
    font-size: 12px;
  }
}
</style>
