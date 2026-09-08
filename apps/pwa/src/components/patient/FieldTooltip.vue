<template>
  <VTooltip location="top" origin="auto" :max-width="image ? 260 : 280" content-class="field-tooltip__content">
    <template #activator="{ props: tooltipProps }">
      <button type="button" class="field-tooltip__trigger" v-bind="tooltipProps" :aria-label="text || imageAlt">
        <AppIcon name="info-circle" class="field-tooltip__icon" />
      </button>
    </template>
    <img v-if="image" :src="image" :alt="imageAlt ?? ''" class="field-tooltip__image" />
    <span v-if="text">{{ text }}</span>
  </VTooltip>
</template>

<script setup lang="ts">
import AppIcon from "../AppIcon.vue";

/**
 * OrthoApnea's own field-level tooltips — confirmed via a live-capture round
 * against apneadock.com (see docs/orthoapnea-wizard-fidelity.md). Some
 * fields have text only, some have an image only (OrthoApnea doesn't
 * explain them in words at all — Apertura frontal / Ganchos para gomillas),
 * some have both (Morning Aligner, Lateralidad, Limitación de apertura), and
 * one field that used to have an invented tooltip here (Máxima protrusión)
 * turned out to have no tooltip on the real site at all — its FieldTooltip
 * usage was removed from the wizard entirely, not just reworded.
 */
defineProps<{
  text?: string;
  /** Local asset URL (see assets/orthoapnea/tooltips/ — downloaded from
   * apneadock.com's own public, unauthenticated asset host). */
  image?: string;
  imageAlt?: string;
}>();
</script>

<style scoped>
.field-tooltip__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  margin-left: 2px;
  border: none;
  background: transparent;
  cursor: help;
  vertical-align: middle;
}

.field-tooltip__icon {
  width: 20px;
  height: 20px;
  color: rgb(var(--v-theme-primary));
}
</style>

<style>
/* Unscoped: VTooltip teleports its content to <body>, out of this
   component's scoped style boundary. */
.field-tooltip__content {
  font-size: 0.875rem;
}

.field-tooltip__image {
  display: block;
  width: 100%;
  max-width: 220px;
  border-radius: 6px;
  margin-bottom: 6px;
}
</style>
