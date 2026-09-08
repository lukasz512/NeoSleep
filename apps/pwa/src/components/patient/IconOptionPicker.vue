<template>
  <div class="icon-option-picker" :class="{ 'icon-option-picker--fill': fill }" role="radiogroup" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="icon-option-picker__item"
      :class="{ 'icon-option-picker__item--selected': modelValue === option.value, 'icon-option-picker__item--fill': fill, 'icon-option-picker__item--large': large }"
      :aria-pressed="modelValue === option.value"
      :aria-label="option.label"
      @click="$emit('update:modelValue', option.value)"
    >
      <img
        v-if="option.imgSrc"
        :src="option.imgSrc"
        :alt="option.label ?? ''"
        class="icon-option-picker__img"
        :class="{ 'icon-option-picker__img--fill': fill, 'icon-option-picker__img--large': large }"
      />
      <svg v-else viewBox="0 0 48 40" class="icon-option-picker__glyph" aria-hidden="true">
        <path :d="option.glyph" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span v-if="option.label && !hideLabels" class="icon-option-picker__label">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Generic icon-radio grid — used for OrthoApnea's "Diseño de férulas" (band
 * shape, 6 options) and "Acabado" (finish, 2 options) pickers. `imgSrc` (when
 * set) renders OrthoApnea's own downloaded reference image (see
 * assets/orthoapnea/ — publicly served static files, not behind their auth);
 * `glyph` is a NeoSleep-drawn SVG fallback for options where no matching
 * reference image exists.
 */
export interface IconOption {
  value: string;
  label?: string;
  glyph?: string;
  imgSrc?: string;
}

defineProps<{
  modelValue: string | null;
  options: IconOption[];
  label?: string;
  /** Stretches items to fill the row's full width — used for pickers with
   * few options (e.g. Acabado's 2) so they read as visually equal in weight
   * to a wider picker above them (e.g. the 6-option band-design picker),
   * rather than looking small/cramped by comparison. */
  fill?: boolean;
  /** Bigger tiles/images — OrthoApnea's own band/finish pickers read as more
   * prominent than NeoSleep's first pass. `option.label` still drives the
   * accessible name either way (aria-label + alt), even when hidden. */
  large?: boolean;
  /** Hides the visible caption under each tile — OrthoApnea's own "Diseño de
   * férula" picker has no number captions under its band images. */
  hideLabels?: boolean;
}>();

defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<style scoped>
.icon-option-picker {
  display: flex;
  /* Never wraps to a second row — items shrink together to fit the
     available width instead (see __item's flex-basis:0/min-width:0 below),
     matching OrthoApnea's own single-row picker at any viewport width. */
  flex-wrap: nowrap;
  justify-content: center;
  gap: 8px;
}

.icon-option-picker__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 0 1 64px;
  min-width: 0;
  padding: 8px 4px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  /* Unselected options read as secondary until picked — only the active
     selection shows at full strength. */
  opacity: 0.35;
  transition: opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.icon-option-picker__item--fill {
  flex: 1 1 0;
  padding-top: 14px;
  padding-bottom: 14px;
}

.icon-option-picker__item--large {
  flex-basis: 84px;
  padding-top: 12px;
  padding-bottom: 12px;
}

.icon-option-picker__item--selected {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  opacity: 1;
}

.icon-option-picker__glyph {
  width: 32px;
  height: 28px;
  max-width: 100%;
}

.icon-option-picker__img {
  width: 36px;
  height: 32px;
  max-width: 100%;
  object-fit: contain;
}

.icon-option-picker__img--fill {
  width: 56px;
  height: 48px;
}

.icon-option-picker__img--large {
  width: 60px;
  height: 52px;
}

.icon-option-picker__img--fill.icon-option-picker__img--large {
  width: 160px;
  height: 90px;
}

.icon-option-picker__label {
  font-size: 0.6875rem;
}
</style>
