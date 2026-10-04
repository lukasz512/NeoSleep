<template>
  <div class="ahi-scale" :class="{ 'ahi-scale--thin': thin }" role="img" :aria-label="t('app.clinical.result.ahiScale', { value: label })">
    <div class="ahi-scale__bar" aria-hidden="true">
      <i /><i /><i /><i />
      <span class="ahi-scale__mark" :style="{ left: `${ahiScalePercent(ahi)}%` }" />
    </div>
    <div v-if="!thin" class="ahi-scale__labels" aria-hidden="true">
      <span>&lt;5</span><span>{{ t("app.clinical.result.scale.mild") }}</span><span>{{ t("app.clinical.result.scale.moderate") }}</span><span>{{ t("app.clinical.result.scale.severe") }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import { ahiScalePercent } from "../utils/ahiSeverity";

/**
 * The AASM severity scale (<5 · mild · moderate · severe) with a mark at the
 * patient's AHI — the PSG result on Estudios and, `thin` (no labels), the
 * PSG tile of the Detalles summary strip (NEO-206).
 */
const props = defineProps<{ ahi: number; thin?: boolean }>();
const { t, locale } = useI18n();
const label = computed(() => props.ahi.toLocaleString(intlLocale(locale.value), { maximumFractionDigits: 1 }));
</script>

<style scoped>
.ahi-scale {
  max-width: 380px;
}
/* Segment widths follow the AHI ranges on a 0–45 scale: 5 · 10 · 15 · 15. */
.ahi-scale__bar {
  position: relative;
  display: grid;
  grid-template-columns: 5fr 10fr 15fr 15fr;
  height: 8px;
  border-radius: 999px;
}
.ahi-scale--thin .ahi-scale__bar {
  height: 4px;
}
.ahi-scale__bar i:nth-child(1) {
  background: #7cc59a;
  border-radius: 999px 0 0 999px;
}
.ahi-scale__bar i:nth-child(2) {
  background: #e8c55a;
}
.ahi-scale__bar i:nth-child(3) {
  background: #ec9a47;
}
.ahi-scale__bar i:nth-child(4) {
  background: #d9594c;
  border-radius: 0 999px 999px 0;
}
.ahi-scale__mark {
  position: absolute;
  top: -4px;
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: rgb(var(--v-theme-on-surface));
  transform: translateX(-50%);
}
.ahi-scale--thin .ahi-scale__mark {
  top: -3px;
  width: 2px;
  height: 10px;
}
.ahi-scale__labels {
  display: grid;
  grid-template-columns: 5fr 10fr 15fr 15fr;
  margin-top: 4px;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
