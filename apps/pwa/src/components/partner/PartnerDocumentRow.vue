<template>
  <div class="partner-document-row" :class="`partner-document-row--${state}`">
    <span class="partner-document-row__icon" aria-hidden="true">
      <AppIcon :name="state === 'done' ? 'check-circle' : 'file'" />
    </span>
    <div class="partner-document-row__text">
      <span class="partner-document-row__title">{{ title }}</span>
      <span class="partner-document-row__meta">
        <VChip size="small" :color="chipColor" variant="tonal" label class="partner-document-row__chip">
          {{ status }}
        </VChip>
        <span class="partner-document-row__subtitle">{{ subtitle }}</span>
      </span>
      <img v-if="thumbnail" :src="thumbnail" alt="" class="partner-document-row__thumb" />
    </div>
    <AppButton
      :variant="state === 'done' ? 'text' : 'outlined'"
      size="small"
      color="primary"
      class="partner-document-row__action"
      @click="emit('open')"
    >
      {{ actionLabel }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { VChip } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";

/**
 * One document on the partner registration page (NEO-51): what it is, where
 * the doctor stands with it, and the button that opens it.
 *
 * `state` is the doctor's progress — "notOpened" (never opened), "opened"
 * (read but not yet signed / acknowledged), "done" (signed, or notice
 * acknowledged). `thumbnail` shows the doctor's own signature once signed.
 */
const props = defineProps<{
  title: string;
  subtitle: string;
  status: string;
  actionLabel: string;
  state: "notOpened" | "opened" | "done";
  thumbnail?: string | null;
}>();

const emit = defineEmits<{ open: [] }>();

const chipColor = computed(() =>
  props.state === "done" ? "success" : props.state === "opened" ? "info" : "warning"
);
</script>

<style scoped>
.partner-document-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
  transition: border-color 200ms ease, background-color 200ms ease;
}

.partner-document-row--opened {
  border-color: rgba(var(--v-theme-info), 0.45);
}

.partner-document-row--done {
  border-color: rgba(var(--v-theme-success), 0.55);
  background: rgba(var(--v-theme-success), 0.05);
}

/* Bigger document mark in a soft tile, so it reads as "a document" at a glance. */
.partner-document-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  font-size: 28px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.partner-document-row--done .partner-document-row__icon {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.12);
}

.partner-document-row__icon :deep(svg) {
  width: 28px;
  height: 28px;
}

.partner-document-row__text {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.partner-document-row__chip {
  font-weight: 600;
  max-width: 100%;
  /* "Opened · not signed yet" is longer than a phone-width row — wrap, don't clip. */
  height: auto !important;
  min-height: 24px;
  padding-block: 3px;
  white-space: normal;
}

.partner-document-row__chip :deep(.v-chip__content) {
  white-space: normal;
}

.partner-document-row__subtitle {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.partner-document-row__thumb {
  height: 28px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  object-position: left;
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
