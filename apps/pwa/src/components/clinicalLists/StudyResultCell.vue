<template>
  <span v-if="result.kind === 'none'" class="study-result__none">—</span>
  <div v-else class="study-result" data-testid="study-result">
    <div class="study-result__line">
      <span class="study-result__ahi">{{ fmt(result.ahi) }}</span>
      <VChip
        v-if="result.kind === 'interpreted'"
        :color="SEVERITY_COLOR[result.severity]"
        size="small"
        variant="tonal"
        data-testid="study-result-severity"
      >{{ t(`app.clinical.result.severity.${result.severity}`) }}</VChip>
      <VChip v-else size="small" variant="outlined" class="study-result__pending" data-testid="study-result-pending">
        {{ t("app.clinicalQueues.study.pendingPulmonologist") }}
      </VChip>
    </div>
    <div v-if="vitals" class="study-result__sub">{{ vitals }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import { studyResult } from "../../utils/clinicalProgress";
import type { AhiSeverity } from "../../utils/ahiSeverity";

/**
 * The Estudios "Resultado" cell (D3, 2026-10-05): AHI with its severity once the
 * pulmonologist interpreted it; before that the same number marked "pending
 * pulmonologist", never a severity. SpO₂ nadir and ODI underneath.
 */
const props = defineProps<{
  study: { status: string; ahi_score: number | null; spo2_nadir: number | null; odi: number | null };
}>();
const { t, locale } = useI18n();

const SEVERITY_COLOR: Record<AhiSeverity, string> = { normal: "success", mild: "info", moderate: "warning", severe: "error" };

const result = computed(() => studyResult(props.study));

function fmt(n: number): string {
  return n.toLocaleString(intlLocale(locale.value), { maximumFractionDigits: 1 });
}

const vitals = computed(() =>
  [
    props.study.spo2_nadir !== null ? `SpO₂ ${fmt(props.study.spo2_nadir)} %` : "",
    props.study.odi !== null ? `${t("app.sleepStudies.form.odi")} ${fmt(props.study.odi)}` : "",
  ].filter(Boolean).join(" · "),
);
</script>

<style scoped>
.study-result {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.study-result__line {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.study-result__ahi {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.study-result__pending {
  border-style: dashed;
}
.study-result__sub,
.study-result__none {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
