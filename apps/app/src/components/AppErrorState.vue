<template>
  <div class="app-error-state" role="status" aria-live="polite">
    <div class="app-error-state__icon-wrap" aria-hidden="true">
      <svg
        class="app-error-state__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <!-- Sad cloud: network/connection problem -->
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        <circle cx="8.5" cy="14" r="0.8" />
        <circle cx="15.5" cy="14" r="0.8" />
        <path d="M9 17.5 Q12 19.5 15 17.5" stroke-linecap="round" />
      </svg>
    </div>
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
        <svg class="app-error-state__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
      </template>
      {{ refreshLabel }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
/**
 * Error state placeholder for network/load failures. Sad cloud icon, message, and refresh button.
 * Similar layout to AppEmptyState for consistency.
 */
defineProps<{
  title: string;
  subtitle?: string;
  refreshLabel: string;
}>();

defineEmits<{
  refresh: [];
}>();
</script>

<style lang="scss" scoped>
.app-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.app-error-state__icon-wrap {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.app-error-state__icon {
  width: 96px;
  height: 96px;
  opacity: 0.4;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.app-error-state__title {
  margin: 0 0 8px;
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--rep-text-primary, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity)));
}

.app-error-state__subtitle {
  margin: 0 0 24px;
  font-size: 0.9375rem;
  color: var(--rep-text-secondary, rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)));
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

@media (min-width: 768px) {
  .app-error-state__icon {
    width: 120px;
    height: 120px;
  }

  .app-error-state__title {
    font-size: 1.25rem;
  }
}
</style>
