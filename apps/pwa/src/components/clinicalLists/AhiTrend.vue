<template>
  <span v-if="baseline === null && latest === null" class="ahi-trend__none">—</span>
  <span v-else class="ahi-trend" :title="t('app.clinicalQueues.ahi.trend')" data-testid="ahi-trend">
    <span class="ahi-trend__num">{{ fmt(baseline) }}</span>
    <template v-if="latest !== null">
      <span class="ahi-trend__arrow" aria-hidden="true">→</span>
      <span class="ahi-trend__num">{{ fmt(latest) }}</span>
      <span v-if="improvement !== null" class="ahi-trend__delta" :class="{ 'ahi-trend__delta--worse': improvement < 0 }">
        {{ improvement >= 0 ? "↓" : "↑" }}{{ Math.abs(improvement) }}%
      </span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import { ahiImprovement } from "../../utils/clinicalProgress";

/** AHI of the study a treatment started from → the latest later study, with the % change. */
const props = defineProps<{ baseline: number | null; latest: number | null }>();
const { t, locale } = useI18n();

const improvement = computed(() => ahiImprovement(props.baseline, props.latest));

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString(intlLocale(locale.value), { maximumFractionDigits: 1 });
}
</script>

<style scoped>
.ahi-trend {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ahi-trend__num {
  font-weight: 500;
}
.ahi-trend__arrow,
.ahi-trend__none {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.ahi-trend__delta {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-success));
}
.ahi-trend__delta--worse {
  color: rgb(var(--v-theme-error));
}
</style>
