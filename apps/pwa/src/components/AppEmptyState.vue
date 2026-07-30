<template>
  <AppStateView :title="title" :subtitle="subtitle">
    <template #icon>
      <AppIcon name="plus-circle" />
    </template>
    <template v-if="showAddButton && addLabel" #cta>
      <AppButton color="primary" variant="outlined" class="app-empty-state__add" :aria-label="addLabel" @click="$emit('add')">
        <template #prepend>
          <AppIcon name="plus" class="app-empty-state__btn-icon" />
        </template>
        {{ addLabel }}
      </AppButton>
    </template>
  </AppStateView>
</template>

<script setup lang="ts">
import { AppStateView } from "@ui";
import AppButton from "./AppButton.vue";
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
/* AppStateView's icon defaults to a neutral on-surface tint (fits the
   "not found"/"error" moods); this "add something" moment reads friendlier
   in brand teal, as it always has here. */
:deep(.app-state-view__icon) {
  color: rgb(var(--v-theme-primary));
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
