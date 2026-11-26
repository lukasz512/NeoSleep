<template>
  <!-- ATM evaluation (NEO-237): a mini copy of the exam — skull, then every finding with its right / left mark, then the opening. -->
  <div v-if="record && record.kind === 'tmj_exam'" class="checklist-result checklist-result--tmj">
    <div class="tmj-result">
      <TmjSkull class="checklist-result__skull" :counts="tmjCounts" mini />
      <table class="tmj-mini">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">{{ t("app.clinical.kind.tmjExam") }}</span></th>
            <th v-for="side in TMJ_SIDES" :key="side" scope="col" :class="{ 'tmj-mini__head--on': tmjCounts[side] > 0 }">
              {{ t(`app.clinical.tmj.${side}`) }} <b>{{ tmjCounts[side] }}</b>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tmjRows" :key="row.key" :class="{ 'tmj-mini__row--on': row.right || row.left }">
            <th scope="row">{{ row.label }}</th>
            <td v-for="side in TMJ_SIDES" :key="side" :data-finding="row.key" :data-side="side">
              <span v-if="row[side]" class="tmj-mini__mark tmj-mini__mark--on" role="img" :aria-label="t('app.clinical.result.yes')">✓</span>
              <span v-else class="tmj-mini__mark" role="img" :aria-label="t('app.clinical.result.no')">—</span>
            </td>
          </tr>
          <tr v-if="record.max_opening_mm != null" class="tmj-mini__opening">
            <th scope="row">{{ t("app.clinical.tmj.maxOpening") }}</th>
            <td colspan="2"><b>{{ t("app.clinical.tmj.mm", { mm: record.max_opening_mm }) }}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Clinical questionnaire (Łukasz 2026-10-05, option A + B's meter): a summary with one meter segment per question, then every question as a row. -->
  <div v-else-if="record && record.kind !== 'stop_bang'" class="checklist-result">
    <div class="checklist-result__summary">
      <span class="checklist-result__total">{{ yesNo.yes }} / {{ yesNo.total }}</span>
      <span class="checklist-result__muted">{{ isOralExam ? t("app.clinical.result.withFinding") : t("app.clinical.result.answeredYes") }}</span>
      <span v-if="skeletalClass" class="checklist-result__value">{{ skeletalClass }}</span>
      <span class="checklist-result__meter" role="img" :aria-label="t('app.clinical.result.meterAria', { yes: yesNo.yes, n: yesNo.total })">
        <i v-for="row in answerRows" :key="row.key" :class="row.state" />
      </span>
    </div>
    <ul class="checklist-result__list">
      <li v-for="row in answerRows" :key="row.key" :data-question="row.key" :data-state="row.state" :class="`checklist-result__item--${row.state}`">
        <span class="checklist-result__mark" aria-hidden="true">{{ MARK[row.state] }}</span>
        <span class="checklist-result__label">{{ row.label }}</span>
        <span class="checklist-result__state">{{ row.status }}</span>
      </li>
    </ul>
    <p v-if="otherText" class="checklist-result__other">{{ otherText }}</p>
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
    <AhiScaleBar :ahi="study.ahi_score" />
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
import { BANG_QUESTIONS, MEDICAL_HISTORY_QUESTIONS, ORAL_EXAM_QUESTIONS, STOP_QUESTIONS, TMJ_FINDINGS, TMJ_SIDES, stopBangRisk, tmjSideCounts } from "../../config/questionnaires";
import TmjSkull from "./TmjSkull.vue";
import { ahiSeverity } from "../../utils/ahiSeverity";
import AhiScaleBar from "../AhiScaleBar.vue";

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
const isOralExam = computed(() => record.value?.kind === "oral_exam");
type AnswerState = "yes" | "no" | "todo";
const MARK: Record<AnswerState, string> = { yes: "!", no: "✓", todo: "–" };
/** Every question with its answer — an oral-exam "no" reads "Normal", a history "no" reads "No". */
const answerRows = computed(() =>
  questions.value.map((q) => {
    const answer = record.value?.[q.key];
    const state: AnswerState = answer === true ? "yes" : answer === false ? "no" : "todo";
    const status =
      state === "yes"
        ? t("app.clinical.result.yes")
        : state === "todo"
          ? t("app.clinical.result.notAnswered")
          : t(isOralExam.value ? "app.clinical.result.normal" : "app.clinical.result.no");
    return { key: q.key, label: t(q.labelKey), state, status };
  })
);
const skeletalClass = computed(() =>
  isOralExam.value && record.value?.skeletal_class ? `${t("app.clinical.skeletalClassLabel")} ${record.value.skeletal_class}` : null
);
const otherText = computed(() =>
  record.value?.kind === "medical_history" && record.value.medical_history_other
    ? t("app.clinical.result.other", { text: record.value.medical_history_other })
    : null
);

const tmjCounts = computed(() => tmjSideCounts(record.value ?? {}));
const tmjRows = computed(() =>
  TMJ_FINDINGS.map((f) => ({
    key: f.key,
    label: t(f.labelKey),
    right: record.value?.[`${f.key}_right`] === true,
    left: record.value?.[`${f.key}_left`] === true,
  }))
);

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

const severity = computed(() => ahiSeverity(study.value?.ahi_score ?? 0));
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
.checklist-result--tmj {
  container: tmj-result / inline-size;
}
.tmj-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.tmj-result .checklist-result__skull {
  width: 56px;
}
/* The exam in miniature: findings down, right / left across, same order as the form. */
.tmj-mini {
  flex: 1 1 auto;
  max-width: 480px;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.tmj-mini th,
.tmj-mini td {
  padding: 4px 8px;
  text-align: center;
  font-weight: 400;
}
.tmj-mini th[scope="row"] {
  text-align: left;
  padding-left: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.tmj-mini thead th {
  width: 88px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.tmj-mini thead th:first-child {
  width: auto;
}
.tmj-mini thead th b {
  font-variant-numeric: tabular-nums;
}
.tmj-mini__head--on b {
  color: rgb(var(--v-theme-warning));
}
.tmj-mini tbody tr + tr {
  border-top: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.6));
}
.tmj-mini__row--on th[scope="row"] {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 500;
}
.tmj-mini__mark {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 20px;
  border-radius: 999px;
  color: rgba(var(--v-theme-on-surface), 0.3);
}
.tmj-mini__mark--on {
  width: 32px;
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
  font-weight: 700;
}
.tmj-mini__opening td {
  font-variant-numeric: tabular-nums;
}
/* Phone: the skull goes above, so the finding labels keep the full width. */
@container tmj-result (max-width: 420px) {
  .tmj-result {
    flex-direction: column;
    align-items: stretch;
  }
  .tmj-result .checklist-result__skull {
    align-self: center;
  }
  .tmj-mini thead th {
    width: 64px;
  }
  .tmj-mini th,
  .tmj-mini td {
    padding: 4px;
  }
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.checklist-result__muted {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__skull {
  width: 44px;
  flex: none;
}
.checklist-result__metric {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.checklist-result__metric b {
  font-size: 1.125rem;
  font-weight: 700;
}
.checklist-result__metric span {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}
.checklist-result__total {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-warning));
}
.checklist-result__value {
  margin-left: auto;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 2px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
}
.checklist-result__meter {
  flex: 1 0 100%;
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.checklist-result__meter i {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.checklist-result__meter i.yes {
  background: rgb(var(--v-theme-warning));
}
.checklist-result__meter i.todo {
  background: none;
  border: 1.5px dashed rgba(var(--v-theme-on-surface), 0.3);
}
.checklist-result__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  column-gap: 24px;
}
.checklist-result__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 0.875rem;
}
.checklist-result__mark {
  width: 16px;
  height: 16px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: 700;
  border: 1.5px solid rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__item--yes .checklist-result__mark {
  border-color: rgb(var(--v-theme-warning));
  background: rgb(var(--v-theme-warning));
  color: rgb(var(--v-theme-on-warning));
}
.checklist-result__item--todo .checklist-result__mark {
  border-style: dashed;
}
.checklist-result__label {
  flex: 1;
  min-width: 0;
}
.checklist-result__state {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.checklist-result__item--yes .checklist-result__state {
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
}
.checklist-result__other {
  margin: 0;
  font-size: 0.875rem;
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
