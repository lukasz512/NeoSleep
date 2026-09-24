<template>
  <div class="partner-document-row" :class="{ 'partner-document-row--done': done }">
    <span class="partner-document-row__icon" aria-hidden="true"><AppIcon name="file" /></span>
    <div class="partner-document-row__text">
      <span class="partner-document-row__title">{{ title }}</span>
      <span class="partner-document-row__meta">
        <VChip size="x-small" :color="done ? 'success' : 'warning'" variant="tonal" label>
          {{ status }}
        </VChip>
        <span class="partner-document-row__subtitle">{{ subtitle }}</span>
        <img v-if="thumbnail" :src="thumbnail" alt="" class="partner-document-row__thumb" />
      </span>
    </div>
    <AppButton variant="outlined" size="small" color="primary" class="partner-document-row__action" @click="emit('open')">
      {{ actionLabel }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { VChip } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";

/**
 * One document on the partner registration page (NEO-51): what it is, where
 * the doctor stands with it (chip), and the button that opens it. `thumbnail`
 * shows the doctor's own signature once they've signed.
 */
defineProps<{
  title: string;
  subtitle: string;
  status: string;
  actionLabel: string;
  done: boolean;
  thumbnail?: string | null;
}>();

const emit = defineEmits<{ open: [] }>();
</script>

<style scoped>
.partner-document-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
}

.partner-document-row--done {
  border-color: rgba(var(--v-theme-success), 0.45);
}

.partner-document-row__icon {
  display: inline-flex;
  color: rgb(var(--v-theme-primary));
  font-size: 1.25rem;
}

.partner-document-row__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.partner-document-row__title {
  font-size: 0.9375rem;
  font-weight: 600;
}

.partner-document-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.partner-document-row__subtitle {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.partner-document-row__thumb {
  height: 22px;
  width: auto;
  max-width: 80px;
  object-fit: contain;
}

.partner-document-row__action {
  text-transform: none;
  letter-spacing: normal;
}

@media (max-width: 480px) {
  .partner-document-row {
    grid-template-columns: auto 1fr;
  }

  .partner-document-row__action {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>
