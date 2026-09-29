<template>
  <div class="sb-gauge" role="img" :aria-label="ariaLabel">
    <div class="sb-gauge__top">
      <span class="sb-gauge__score">{{ score }}<small> / 8</small></span>
      <span class="sb-gauge__risk" :class="complete ? `sb-gauge__risk--${risk}` : 'sb-gauge__risk--pending'">
        {{ complete ? t(`app.clinical.risk.${risk}`) : t("app.clinical.gauge.pending", { n: missing }) }}
      </span>
    </div>
    <div class="sb-gauge__bar" aria-hidden="true">
      <i v-for="n in 8" :key="n" :class="n <= score ? `sb-gauge__seg--${zoneOf(n)}` : ''" />
    </div>
    <div class="sb-gauge__legend" aria-hidden="true">
      <span>{{ t("app.clinical.gauge.low") }}</span>
      <span>{{ t("app.clinical.gauge.intermediate") }}</span>
      <span>{{ t("app.clinical.gauge.high") }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { stopBangRisk } from "../../config/questionnaires";

/**
 * STOP-Bang score on the official 0–8 scale with its three zones (0–2 low,
 * 3–4 intermediate, 5–8 high) — the same scale the PDF prints. Colour is
 * never the only signal: the risk is also written out. While answers are
 * missing it shows the running count and how many are left, no risk.
 */
const props = defineProps<{
  answers: Record<string, boolean | null>;
  keys: readonly string[];
}>();
const { t } = useI18n();

const score = computed(() => props.keys.filter((key) => props.answers[key] === true).length);
const missing = computed(() => props.keys.filter((key) => props.answers[key] == null).length);
const complete = computed(() => missing.value === 0);
const risk = computed(() => stopBangRisk(score.value));
const zoneOf = (n: number) => (n <= 2 ? "low" : n <= 4 ? "intermediate" : "high");
const ariaLabel = computed(() =>
  complete.value
    ? t("app.clinical.gauge.aria", { score: score.value, risk: t(`app.clinical.risk.${risk.value}`) })
    : t("app.clinical.gauge.ariaPending", { score: score.value, n: missing.value })
);
</script>

<style scoped>
.sb-gauge {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sb-gauge__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.sb-gauge__score {
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sb-gauge__score small {
  font-size: 0.875rem;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.sb-gauge__risk {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: right;
}
.sb-gauge__risk--low { color: rgb(var(--v-theme-success)); }
.sb-gauge__risk--intermediate { color: rgb(var(--v-theme-warning)); }
.sb-gauge__risk--high { color: rgb(var(--v-theme-error)); }
.sb-gauge__risk--pending {
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}
.sb-gauge__bar {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
}
.sb-gauge__bar i {
  height: 8px;
  border-radius: 2px;
  background: rgb(var(--v-theme-outline-variant));
  transition: background-color 240ms var(--pwa-ease-out-smooth, ease);
}
.sb-gauge__bar i.sb-gauge__seg--low { background: rgb(var(--v-theme-success)); }
.sb-gauge__bar i.sb-gauge__seg--intermediate { background: rgb(var(--v-theme-warning)); }
.sb-gauge__bar i.sb-gauge__seg--high { background: rgb(var(--v-theme-error)); }
.sb-gauge__legend {
  display: grid;
  grid-template-columns: 2fr 2fr 4fr;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.sb-gauge__legend span:nth-child(2) { text-align: center; }
.sb-gauge__legend span:last-child { text-align: right; }
@media (prefers-reduced-motion: reduce) {
  .sb-gauge__bar i { transition: none; }
}
</style>
