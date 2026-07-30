<template>
  <AppStateView :title="title" :subtitle="subtitle">
    <template #icon>
      <AppIcon name="sad-cloud" />
    </template>
    <template #cta>
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
  }>(),
  { loading: false },
);

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.app-error-state__refresh {
  min-height: 44px;
  min-width: 44px;
}

.app-error-state__btn-icon {
  width: 20px;
  height: 20px;
}
</style>
