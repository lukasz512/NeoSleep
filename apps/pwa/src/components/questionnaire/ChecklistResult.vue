<template>
  <!-- Clinical questionnaire: counts + proportion + the positive answers. -->
  <div v-if="record && record.kind !== 'stop_bang'" class="checklist-result">
    <div class="checklist-result__row">
      <span class="checklist-result__count checklist-result__count--yes">
        <b>{{ yesNo.yes }}</b><span>{{ record.kind === "oral_exam" ? t("app.clinical.result.findings") : t("app.clinical.result.yes") }}</span>
      </span>
      <span class="checklist-result__count">
        <b>{{ yesNo.no }}</b><span>{{ record.kind === "oral_exam" ? t("app.clinical.result.normal") : t("app.clinical.result.no") }}</span>
      </span>
      <span class="checklist-result__split" aria-hidden="true"><i :style="{ width: `${(yesNo.yes / Math.max(yesNo.total, 1)) * 100}%` }" /></span>
      <span class="checklist-result__muted">{{ t("app.clinical.result.ofQuestions", { n: yesNo.total }) }}</span>
    </div>
    <div v-if="positives.length || extras.length" class="checklist-result__chips">
      <span v-for="label in positives" :key="label" class="checklist-result__chip checklist-result__chip--yes">{{ label }}</span>
      <span v-for="label in extras" :key="label" class="checklist-result__chip">{{ label }}</span>
    </div>
  </div>

  <!-- STOP-Bang: score, risk, one letter per question (filled = yes; dashed = not asked yet). -->
  <div v-else-if="record" class="checklist-result checklist-result__row">
    <span class="checklist-result__score">
      {{ record.score ?? stopYes }}<small>{{ record.score == null ? ` ${t("app.clinical.result.stopOnly")}` : " / 8" }}</small>
    </span>
    <span v-if="record.score != null" class="checklist-result__pill" :class="`checklist-result__pill--${risk}`">{{ t(`app.clinical.risk.${risk}`) }}</span>
    <span class="checklist-result__letters" role="img" :aria-label="t('app.clinical.result.letters', { yes: lettersYes })">
      <span v-for="(letter, i) in letters" :key="i" :class="letter.state" aria-hidden="true">{{ letter.char }}</span>
    </span>
  </div>

  <!-- Polysomnography: the numbers + where the AHI falls on the severity scale. -->
  <div v-else-if="study && study.ahi_score != null" class="checklist-result">
    <div class="checklist-result__row">
      <span class="checklist-result__metric"><b>{{ formatNumber(study.ahi_score) }}</b><span>{{ t("app.clinical.result.ahi") }}</span></span>
      <span v-if="study.spo2_nadir != null" class="checklist-result__metric"><b>{{ formatNumber(study.spo2_nadir) }} %</b><span>{{ t("app.clinical.result.spo2") }}</span></span>
      <span v-if="study.odi != null" class="checklist-result__metric"><b>{{ formatNumber(study.odi) }}</b><span>{{ t("app.clinical.result.odi") }}</span></span>
      <span class="checklist-result__pill" :class="`checklist-result__pill--${SEVERITY_TONE[severity]}`">{{ t(`app.clinical.result.severity.${severity}`) }}</span>
    </div>
    <div class="checklist-result__ahi" role="img" :aria-label="t('app.clinical.result.ahiScale', { value: formatNumber(study.ahi_score) })">
      <div class="checklist-result__ahi-bar" aria-hidden="true">
        <i /><i /><i /><i />
        <span class="checklist-result__ahi-mark" :style="{ left: `${(Math.min(study.ahi_score, AHI_MAX) / AHI_MAX) * 100}%` }" />
      </div>
      <div class="checklist-result__ahi-scale" aria-hidden="true">
        <span>&lt;5</span><span>{{ t("app.clinical.result.scale.mild") }}</span><span>{{ t("app.clinical.result.scale.moderate") }}</span><span>{{ t("app.clinical.result.scale.severe") }}</span>
      </div>
    </div>
  </div>

  <!-- A consent signed on the phone. -->
  <div v-else-if="entry?.type === 'consent'" class="checklist-result checklist-result__row">
    <span class="checklist-result__pill checklist-result__pill--low">{{ t("app.clinical.result.signed") }}</span>
    <button type="button" class="checklist-result__link" @click="emit('print')">{{ t("app.clinical.result.viewSignedPdf") }}</button>
  </div>

  <!-- A file the doctor attached (scan, external report). -->
  <div v-else-if="entry?.type === 'upload'" class="checklist-result">
    <button type="button" class="checklist-result__file" @click="emit('open-file', entry)">
      <AppIcon name="file" />
      <span>{{ entry.filename ?? entry.title }}</span>
    </button>
    <p v-if="entry.notes" class="checklist-result__notes">{{ entry.notes }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import { intlLocale } from "@i18n/language-options";
import type { ChecklistHistoryEntry } from "../../composables/usePatientChecklist";
import { BANG_QUESTIONS, MEDICAL_HISTORY_QUESTIONS, ORAL_EXAM_QUESTIONS, STOP_QUESTIONS, stopBangRisk } from "../../config/questionnaires";

/**
 * What a finished (or half-finished) Estudios item shows in place of its
 * action buttons (NEO-36, Łukasz 2026-09-25): the result itself —
 * yes/no counts + positive answers, the STOP-Bang score and letters, the
 * PSG numbers on the AHI severity scale, a signed consent, an attached file.
 */
const props = defineProps<{ entry: ChecklistHistoryEntry | null }>();
const emit = defineEmits<{ print: []; "open-file": [entry: ChecklistHistoryEntry] }>();
const { t, locale } = useI18n();

const record = computed(() => props.entry?.record ?? null);
const study = computed(() => props.entry?.sleep_study ?? null);

const questions = computed(() => (record.value?.kind === "oral_exam" ? ORAL_EXAM_QUESTIONS : MEDICAL_HISTORY_QUESTIONS));
const yesNo = computed(() => {
  const answers = questions.value.map((q) => record.value?.[q.key]);
  const yes = answers.filter((a) => a === true).length;
  return { yes, no: answers.filter((a) => a === false).length, total: questions.value.length };
});
const positives = computed(() => questions.value.filter((q) => record.value?.[q.key] === true).map((q) => t(q.labelKey)));
const extras = computed(() => {
  const r = record.value;
  if (!r) return [];
  if (r.kind === "oral_exam" && r.skeletal_class) return [`${t("app.clinical.skeletalClassLabel")} ${r.skeletal_class}`];
  if (r.kind === "medical_history" && r.medical_history_other) return [t("app.clinical.result.other", { text: r.medical_history_other })];
  return [];
});

const STOP_BANG_LETTERS = ["S", "T", "O", "P", "B", "A", "N", "G"];
const letters = computed(() =>
  [...STOP_QUESTIONS, ...BANG_QUESTIONS].map((q, i) => {
    const answer = record.value?.[q.key];
    const state = answer === true ? "yes" : answer === false ? "no" : "todo";
    return { char: STOP_BANG_LETTERS[i]!, state: i === 4 ? `${state} gap` : state };
  })
);
const lettersYes = computed(() => letters.value.filter((l) => l.state.startsWith("yes")).map((l) => l.char).join(" ") || "—");
const stopYes = computed(() => STOP_QUESTIONS.filter((q) => record.value?.[q.key] === true).length);
const risk = computed(() => stopBangRisk(record.value?.score ?? 0));

/** AASM adult OSA severity by AHI (events/h): <5 none, 5–15 mild, 15–30 moderate, ≥30 severe. */
const AHI_MAX = 45;
const severity = computed(() => {
  const ahi = study.value?.ahi_score ?? 0;
  if (ahi >= 30) return "severe";
  if (ahi >= 15) return "moderate";
  if (ahi >= 5) return "mild";
  return "normal";
});
const SEVERITY_TONE = { normal: "low", mild: "intermediate", moderate: "intermediate", severe: "high" } as const;

const formatNumber = (value: number) => value.toLocaleString(intlLocale(locale.value), { maximumFractionDigits: 1 });
</script>

<style scoped>
.checklist-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checklist-result__row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
}
.checklist-result__muted {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__count,
.checklist-result__metric {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.checklist-result__count b,
.checklist-result__metric b {
  font-size: 1.125rem;
  font-weight: 700;
}
.checklist-result__count span,
.checklist-result__metric span {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__count--yes b {
  color: rgb(var(--v-theme-warning));
}
.checklist-result__split {
  flex: 1 1 120px;
  max-width: 220px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.checklist-result__split i {
  display: block;
  height: 100%;
  background: rgb(var(--v-theme-warning));
}
.checklist-result__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.checklist-result__chip {
  font-size: 0.8125rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.checklist-result__chip--yes {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
  font-weight: 500;
}
.checklist-result__score {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.checklist-result__score small {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__pill {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 999px;
}
.checklist-result__pill--low {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}
.checklist-result__pill--intermediate {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}
.checklist-result__pill--high {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}
.checklist-result__letters {
  display: inline-flex;
  gap: 4px;
}
.checklist-result__letters span {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__letters span.yes {
  background: rgb(var(--v-theme-warning));
  color: rgb(var(--v-theme-on-warning));
}
.checklist-result__letters span.todo {
  background: none;
  border: 1.5px dashed rgba(var(--v-theme-on-surface), 0.3);
}
.checklist-result__letters span.gap {
  margin-left: 8px;
}
.checklist-result__ahi {
  max-width: 380px;
}
.checklist-result__ahi-bar {
  position: relative;
  display: grid;
  grid-template-columns: 5fr 10fr 15fr 15fr;
  height: 8px;
  border-radius: 999px;
}
.checklist-result__ahi-bar i:nth-child(1) {
  background: #7cc59a;
  border-radius: 999px 0 0 999px;
}
.checklist-result__ahi-bar i:nth-child(2) {
  background: #e8c55a;
}
.checklist-result__ahi-bar i:nth-child(3) {
  background: #ec9a47;
}
.checklist-result__ahi-bar i:nth-child(4) {
  background: #d9594c;
  border-radius: 0 999px 999px 0;
}
.checklist-result__ahi-mark {
  position: absolute;
  top: -4px;
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: rgb(var(--v-theme-on-surface));
  transform: translateX(-50%);
}
.checklist-result__ahi-scale {
  display: grid;
  grid-template-columns: 5fr 10fr 15fr 15fr;
  margin-top: 4px;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__link {
  border: none;
  background: none;
  padding: 6px 0;
  min-height: 32px;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  font-size: 0.875rem;
  font-weight: 500;
}
.checklist-result__file {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.8125rem;
}
.checklist-result__file :deep(svg) {
  width: 16px;
  height: 16px;
}
.checklist-result__notes {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
