<template>
  <VCard variant="outlined" class="page-section">
    <VCardTitle class="text-h6">{{ title }}</VCardTitle>
    <VCardText v-if="$slots.default">
      <slot />
    </VCardText>
    <VCardText v-else-if="subtitle" class="text-body-2 text-medium-emphasis">
      {{ subtitle }}
    </VCardText>
  </VCard>
</template>

<script setup lang="ts">
/**
 * Reusable page section (card with title + optional subtitle or slot).
 * Used in pwa now; intended for reuse in client, portal, and admin when shared UI base exists.
 */
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<style scoped>
.page-section {
  max-width: 640px;
}
</style>
