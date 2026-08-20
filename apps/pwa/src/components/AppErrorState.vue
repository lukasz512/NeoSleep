<template>
  <AppStateView :title="title" :subtitle="subtitle">
    <template #icon>
      <AppIcon name="sad-cloud" />
    </template>
    <template #cta>
      <div class="app-error-state__actions">
        <AppButton
          color="primary"
          variant="outlined"
          class="app-error-state__refresh"
          :loading="loading"
          :aria-label="refreshLabel"
          @click="$emit('refresh')"
        >
          <template #prepend>
            <AppIcon name="refresh" class="app-error-state__btn-icon" />
          </template>
          {{ refreshLabel }}
        </AppButton>
        <AppButton
          v-if="secondaryLabel && secondaryHref"
          variant="text"
          class="app-error-state__secondary"
          :href="secondaryHref"
          :aria-label="secondaryLabel"
        >
          {{ secondaryLabel }}
        </AppButton>
      </div>
    </template>
  </AppStateView>
</template>

<script setup lang="ts">
import { AppStateView } from "@ui";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    refreshLabel: string;
    loading?: boolean;
    /** Optional secondary action (e.g. "Report incident") rendered as a plain-text link below the refresh button — a `href` (mailto:, tel:, etc.) rather than an emit, since it's meant for actions that leave the app. */
    secondaryLabel?: string;
    secondaryHref?: string;
  }>(),
  { loading: false },
);

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.app-error-state__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.app-error-state__refresh {
  min-height: 44px;
  min-width: 44px;
}

.app-error-state__secondary {
  min-height: 44px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.app-error-state__btn-icon {
  width: 20px;
  height: 20px;
}
</style>
