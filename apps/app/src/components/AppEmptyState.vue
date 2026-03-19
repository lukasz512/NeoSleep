<template>
  <div class="app-empty-state" role="status" aria-live="polite">
    <div class="app-empty-state__icon-wrap" aria-hidden="true">
      <svg
        class="app-empty-state__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <!-- Add / invite: plus in circle – clear CTA to add a record -->
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" stroke-width="2" />
        <line x1="8" y1="12" x2="16" y2="12" stroke-width="2" />
      </svg>
    </div>
    <p class="app-empty-state__title">{{ title }}</p>
    <p v-if="subtitle" class="app-empty-state__subtitle">{{ subtitle }}</p>
    <VBtn
      v-if="showAddButton && addLabel"
      color="primary"
      variant="outlined"
      class="app-empty-state__add"
      :aria-label="addLabel"
      @click="$emit('add')"
    >
      <template #prepend>
        <svg class="app-empty-state__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      </template>
      {{ addLabel }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
/**
 * Empty state placeholder for views with no data. Large, slightly transparent icon and message.
 * When showAddButton is true (e.g. admin), shows an Add button that emits "add".
 */
defineProps<{
  title: string;
  subtitle?: string;
  showAddButton?: boolean;
  addLabel?: string;
}>();

defineEmits<{
  add: [];
}>();
</script>

<style scoped>
.app-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.app-empty-state__icon-wrap {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.app-empty-state__icon {
  width: 96px;
  height: 96px;
  opacity: 0.55;
  color: rgb(var(--v-theme-primary));
}

.app-empty-state__title {
  margin: 0 0 8px;
  font-size: 1.125rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.app-empty-state__subtitle {
  margin: 0 0 24px;
  font-size: 0.9375rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  max-width: 320px;
}

.app-empty-state__add {
  min-height: 44px;
  min-width: 44px;
}

.app-empty-state__btn-icon {
  width: 20px;
  height: 20px;
}

@media (min-width: 768px) {
  .app-empty-state__icon {
    width: 120px;
    height: 120px;
  }

  .app-empty-state__title {
    font-size: 1.25rem;
  }
}
</style>
