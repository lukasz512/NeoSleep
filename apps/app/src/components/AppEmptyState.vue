<template>
  <div class="app-empty-state" role="status" aria-live="polite">
    <AppIcon name="plus-circle" class="app-empty-state__icon" />
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
        <AppIcon name="plus" class="app-empty-state__btn-icon" />
      </template>
      {{ addLabel }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

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

.app-empty-state__icon {
  width: clamp(96px, 10vw, 120px);
  height: clamp(96px, 10vw, 120px);
  margin-bottom: 20px;
  opacity: 0.55;
  color: rgb(var(--v-theme-primary));
}

.app-empty-state__title {
  margin: 0 0 8px;
  font-size: clamp(1.125rem, 2vw, 1.25rem);
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
</style>
