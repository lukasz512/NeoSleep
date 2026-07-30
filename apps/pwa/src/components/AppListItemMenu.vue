<template>
  <VMenu location="bottom end">
    <template #activator="{ props: menuProps }">
      <AppButton
        v-bind="menuProps"
        icon
        variant="flat"
        size="small"
        class="app-list-item-menu__trigger"
        :aria-label="ariaLabel"
        @click.stop.prevent
      >
        <AppIcon name="dots-vertical" class="app-list-item-menu__icon" />
      </AppButton>
    </template>
    <VList class="app-list-item-menu__list">
      <slot />
    </VList>
  </VMenu>
</template>

<script setup lang="ts">
import { VMenu, VList } from "vuetify/components";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";

defineProps<{
  ariaLabel: string;
}>();
</script>

<style scoped>
.app-list-item-menu__trigger {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  border: none;
  box-shadow: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  flex-shrink: 0;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

.app-list-item-menu__icon {
  width: 22px;
  height: 22px;
  display: block;
}

.app-list-item-menu__list :deep(.v-list-item) {
  min-height: 44px;
}

/* Icon and label need room to breathe — Vuetify's default prepend spacer
   reads as cramped next to our thicker custom SVG icons. */
.app-list-item-menu__list :deep(.v-list-item__prepend) {
  margin-inline-end: 14px;
}

.app-list-item-menu__list :deep(.v-list-item__prepend .v-list-item__spacer) {
  width: 0;
}
</style>
