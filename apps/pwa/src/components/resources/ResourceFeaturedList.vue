<template>
  <div class="resource-featured" data-testid="resources-featured">
    <a
      v-for="item in items"
      :key="item.id"
      class="resource-featured__card"
      :href="featuredResourceHref(item)"
      target="_blank"
      rel="noopener"
      :data-testid="`resources-featured-${item.id}`"
    >
      <AppIcon :name="item.icon" class="resource-featured__icon" />
      <span class="resource-featured__text">
        <span class="resource-featured__title">{{ t(item.titleKey) }}</span>
        <span class="resource-featured__subtitle">{{ t(item.subtitleKey) }}</span>
      </span>
      <AppIcon name="chevron-right" class="resource-featured__chevron" />
    </a>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import { FEATURED_RESOURCES, featuredResourceHref, type FeaturedResource } from "../../config/featuredResources";

withDefaults(defineProps<{ items?: readonly FeaturedResource[] }>(), { items: () => FEATURED_RESOURCES });

const { t } = useI18n();
</script>

<style scoped>
.resource-featured {
  display: grid;
  gap: 12px;
  margin-bottom: 24px;
}
/* Full width only on phones; on wider screens a document row, not a banner (NEO-242). */
@media (min-width: 600px) {
  .resource-featured {
    max-width: 480px;
  }
}

/* Same tonal card as the document tiles (surface-container-low + outline-variant), one full-width row. */
.resource-featured__card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface-container-low));
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.resource-featured__card:hover {
  background: rgb(var(--v-theme-surface-container));
}
.resource-featured__card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.resource-featured__icon {
  flex-shrink: 0;
  font-size: 32px;
  color: rgb(var(--v-theme-primary));
}

.resource-featured__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.resource-featured__title {
  font-size: 1rem;
  font-weight: 700;
}

.resource-featured__subtitle {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.resource-featured__chevron {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
