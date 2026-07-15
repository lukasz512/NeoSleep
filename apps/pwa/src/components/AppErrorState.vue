<template>
  <div class="app-error-state" role="status" aria-live="polite">
    <AppIcon name="sad-cloud" class="app-error-state__icon" />
    <p class="app-error-state__title">{{ title }}</p>
    <p v-if="subtitle" class="app-error-state__subtitle">{{ subtitle }}</p>
    <VBtn
      color="primary"
      variant="outlined"
      class="app-error-state__refresh"
      :aria-label="refreshLabel"
      @click="$emit('refresh')"
    >
      <template #prepend>
        <AppIcon name="refresh" class="app-error-state__btn-icon" />
      </template>
      {{ refreshLabel }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

defineProps<{
  title: string;
  subtitle?: string;
  refreshLabel: string;
}>();

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.app-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.app-error-state__icon {
  width: clamp(96px, 10vw, 120px);
  height: clamp(96px, 10vw, 120px);
  margin-bottom: 20px;
  opacity: 0.4;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.app-error-state__title {
  margin: 0 0 8px;
  font-size: clamp(1.125rem, 2vw, 1.25rem);
  font-weight: 500;
  color: var(--pwa-text-primary, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity)));
}

.app-error-state__subtitle {
  margin: 0 0 24px;
  font-size: 0.9375rem;
  color: var(--pwa-text-secondary, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
  max-width: 360px;
}

.app-error-state__refresh {
  min-height: 44px;
  min-width: 44px;
}

.app-error-state__btn-icon {
  width: 20px;
  height: 20px;
}
</style>
