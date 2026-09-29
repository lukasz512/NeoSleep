<template>
  <div class="sb-form">
    <div class="sb-form__main">
      <!-- S-T-O-P: the patient's part. -->
      <div class="sb-form__section">
        <span>{{ t("app.clinical.section.stop") }}</span>
      </div>
      <p v-if="patientStamp" class="sb-form__stamp">
        <AppIcon name="check-circle" class="sb-form__stamp-icon" />
        {{ patientStamp }}
      </p>
      <div v-for="question in STOP_QUESTIONS" :key="question.key" class="sb-form__row">
        <span class="sb-form__letter">{{ STOP_BANG_LETTERS[question.key] }}</span>
        <!-- eslint-disable-next-line vue/no-v-html -- our own static SVG paths (stopBangIcons.ts), no user input -->
        <svg viewBox="0 0 24 24" class="sb-form__icon" aria-hidden="true" v-html="STOP_BANG_ICONS[question.key]" />
        <span :id="`sb-${question.key}`" class="sb-form__question">{{ t(question.labelKey) }}</span>
        <span v-if="stopReadonly" class="sb-form__value" :class="valueClass(modelValue[question.key])">{{ answerText(modelValue[question.key]) }}</span>
        <YesNoToggle v-else :model-value="modelValue[question.key]" :labelledby="`sb-${question.key}`" @update:model-value="set(question.key, $event)" />
      </div>

      <!-- B-A-N-G: the specialist's part — measured, so B and N are worked out, not guessed. -->
      <div class="sb-form__section">
        <span>{{ t("app.clinical.section.bang") }}</span>
      </div>

      <!-- B: height + weight → BMI -->
      <div class="sb-form__row sb-form__row--measure">
        <span class="sb-form__letter">B</span>
        <!-- eslint-disable-next-line vue/no-v-html -- static SVG paths -->
        <svg viewBox="0 0 24 24" class="sb-form__icon" aria-hidden="true" v-html="STOP_BANG_ICONS.bmi_over_35" />
        <span id="sb-bmi" class="sb-form__question">
          {{ t("app.clinical.bang.bmi") }}
          <small v-if="bmi != null">{{ t("app.clinical.bang.bmiValue", { bmi: formatNumber(bmi) }) }}</small>
        </span>
        <template v-if="!readonly">
          <span class="sb-form__inputs">
            <VTextField v-model="measures.height_cm" :label="t('app.clinical.bang.heightCm')" :suffix="t('app.clinical.bang.unitCm')" inputmode="decimal" variant="outlined" density="compact" hide-details class="sb-form__input" />
            <VTextField v-model="measures.weight_kg" :label="t('app.clinical.bang.weightKg')" :suffix="t('app.clinical.bang.unitKg')" inputmode="decimal" variant="outlined" density="compact" hide-details class="sb-form__input" />
          </span>
          <span v-if="bmi != null" class="sb-form__value sb-form__value--auto" :class="valueClass(modelValue.bmi_over_35)">{{ answerText(modelValue.bmi_over_35) }}</span>
          <YesNoToggle v-else :model-value="modelValue.bmi_over_35" labelledby="sb-bmi" @update:model-value="set('bmi_over_35', $event)" />
        </template>
        <span v-else class="sb-form__value" :class="valueClass(modelValue.bmi_over_35)">{{ answerText(modelValue.bmi_over_35) }}</span>
      </div>
      <p v-if="measureError.bmi" class="sb-form__error">{{ measureError.bmi }}</p>

      <!-- A: from the date of birth -->
      <div class="sb-form__row">
        <span class="sb-form__letter">A</span>
        <!-- eslint-disable-next-line vue/no-v-html -- static SVG paths -->
        <svg viewBox="0 0 24 24" class="sb-form__icon" aria-hidden="true" v-html="STOP_BANG_ICONS.age_over_50" />
        <span id="sb-age" class="sb-form__question">
          {{ t("app.clinical.bang.age") }}
          <small v-if="age != null">{{ t("app.clinical.bang.fromRecordAge", { age }) }}</small>
        </span>
        <span v-if="readonly || age != null" class="sb-form__value" :class="[valueClass(modelValue.age_over_50), { 'sb-form__value--auto': !readonly }]">{{ answerText(modelValue.age_over_50) }}</span>
        <YesNoToggle v-else :model-value="modelValue.age_over_50" labelledby="sb-age" @update:model-value="set('age_over_50', $event)" />
      </div>

      <!-- N: neck circumference -->
      <div class="sb-form__row sb-form__row--measure">
        <span class="sb-form__letter">N</span>
        <!-- eslint-disable-next-line vue/no-v-html -- static SVG paths -->
        <svg viewBox="0 0 24 24" class="sb-form__icon" aria-hidden="true" v-html="STOP_BANG_ICONS.neck_circumference_over_40cm" />
        <span id="sb-neck" class="sb-form__question">
          {{ t("app.clinical.bang.neck") }}
          <small v-if="readonly && record?.neck_cm != null">{{ t("app.clinical.bang.neckValue", { neck: formatNumber(Number(record.neck_cm)) }) }}</small>
        </span>
        <template v-if="!readonly">
          <span class="sb-form__inputs">
            <VTextField v-model="measures.neck_cm" :label="t('app.clinical.bang.neckCm')" :suffix="t('app.clinical.bang.unitCm')" inputmode="decimal" variant="outlined" density="compact" hide-details class="sb-form__input" />
          </span>
          <span v-if="neck != null" class="sb-form__value sb-form__value--auto" :class="valueClass(modelValue.neck_circumference_over_40cm)">{{ answerText(modelValue.neck_circumference_over_40cm) }}</span>
          <YesNoToggle v-else :model-value="modelValue.neck_circumference_over_40cm" labelledby="sb-neck" @update:model-value="set('neck_circumference_over_40cm', $event)" />
        </template>
        <span v-else class="sb-form__value" :class="valueClass(modelValue.neck_circumference_over_40cm)">{{ answerText(modelValue.neck_circumference_over_40cm) }}</span>
      </div>
      <p v-if="measureError.neck" class="sb-form__error">{{ measureError.neck }}</p>

      <!-- G: from the patient's record; ticked by hand when the record has no sex (never written back). -->
      <div class="sb-form__row">
        <span class="sb-form__letter">G</span>
        <!-- eslint-disable-next-line vue/no-v-html -- static SVG paths -->
        <svg viewBox="0 0 24 24" class="sb-form__icon" aria-hidden="true" v-html="STOP_BANG_ICONS.is_male" />
        <span id="sb-sex" class="sb-form__question">
          {{ t("app.clinical.bang.male") }}
          <small v-if="sexFromRecord != null">{{ t("app.clinical.bang.fromRecord") }}</small>
        </span>
        <span v-if="readonly || sexFromRecord != null" class="sb-form__value" :class="[valueClass(modelValue.is_male), { 'sb-form__value--auto': !readonly }]">{{ answerText(modelValue.is_male) }}</span>
        <YesNoToggle v-else :model-value="modelValue.is_male" labelledby="sb-sex" @update:model-value="set('is_male', $event)" />
      </div>
    </div>

    <aside class="sb-form__side">
      <StopBangScoreGauge :answers="modelValue" :keys="ALL_KEYS" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import AppIcon from "../AppIcon.vue";
import StopBangScoreGauge from "./StopBangScoreGauge.vue";
import YesNoToggle from "./YesNoToggle.vue";
import { STOP_QUESTIONS, BANG_QUESTIONS, parseStopBangMeasure, type StopBangMeasureKey } from "../../config/questionnaires";
import { STOP_BANG_ICONS, STOP_BANG_LETTERS } from "./stopBangIcons";
import { ageFromDateOfBirth } from "../../utils/patientDemographics";
import type { ChecklistRecord } from "../../composables/usePatientChecklist";

/**
 * STOP-Bang for the specialist (Łukasz, 2026-09-26, "form 3"): the same row
 * grammar as every other clinical form (letter, illustration, question,
 * answer in one right column). S-T-O-P shows the patient's answers with an
 * attribution stamp when they came from the personal link. B-A-N-G are
 * worked out, not guessed: height + weight → BMI → B, neck cm → N, age from
 * the date of birth → A, sex from the record → G. Where a value is missing
 * the specialist answers that letter by hand. The API recomputes B and N
 * from the measurements it receives (it is the trust boundary); the
 * automatic answers here are only the preview.
 */
export interface StopBangMeasures {
  height_cm: string;
  weight_kg: string;
  neck_cm: string;
}

const props = defineProps<{
  modelValue: Record<string, boolean | null>;
  measures: StopBangMeasures;
  mode: "create" | "view" | "completeBang";
  record?: ChecklistRecord | null;
  dateOfBirth?: string | null;
  gender?: string | null;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Record<string, boolean | null>] }>();
const { t, locale } = useI18n();

const ALL_KEYS = [...STOP_QUESTIONS, ...BANG_QUESTIONS].map((q) => q.key);
const readonly = computed(() => props.mode === "view");
const stopReadonly = computed(() => props.mode !== "create");
// The parent owns the measures object; editing its fields in place keeps one source of truth.
const measures = reactive(props.measures);

const parseMeasure = (key: StopBangMeasureKey) => parseStopBangMeasure(measures[key], key);

const bmiInput = computed(() => ({ height: parseMeasure("height_cm"), weight: parseMeasure("weight_kg") }));
const bmi = computed(() => {
  if (readonly.value) return props.record?.bmi != null ? Number(props.record.bmi) : null;
  const { height, weight } = bmiInput.value;
  if (typeof height !== "number" || typeof weight !== "number") return null;
  return Math.round((weight / (height / 100) ** 2) * 10) / 10;
});
const neck = computed(() => {
  const value = parseMeasure("neck_cm");
  return typeof value === "number" ? value : null;
});
const measureError = computed(() => {
  const { height, weight } = bmiInput.value;
  return {
    bmi:
      height === "invalid" || weight === "invalid"
        ? t("app.clinical.bang.rangeBmi")
        : (height === null) !== (weight === null)
          ? t("app.clinical.bang.bothNeeded")
          : "",
    neck: parseMeasure("neck_cm") === "invalid" ? t("app.clinical.bang.rangeNeck") : "",
  };
});

const age = computed(() => ageFromDateOfBirth(props.dateOfBirth));
const sexFromRecord = computed<boolean | null>(() => (props.gender === "male" ? true : props.gender === "female" ? false : null));

const patientStamp = computed(() => {
  const r = props.record;
  if (r?.source !== "patient") return "";
  const when = new Date(r.created_at).toLocaleString(intlLocale(locale.value), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return t("app.clinical.patientStamp", { date: when });
});

function set(key: string, value: boolean | null) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

// Letters that can be worked out follow their inputs (edit mode only).
watch(
  [bmi, neck, age, sexFromRecord, () => props.mode],
  () => {
    if (readonly.value) return;
    const next = { ...props.modelValue };
    if (bmi.value != null) next.bmi_over_35 = bmi.value > 35;
    if (neck.value != null) next.neck_circumference_over_40cm = neck.value > 40;
    if (age.value != null) next.age_over_50 = age.value > 50;
    if (sexFromRecord.value != null) next.is_male = sexFromRecord.value;
    if (ALL_KEYS.some((key) => next[key] !== props.modelValue[key])) emit("update:modelValue", next);
  },
  { immediate: true }
);

function answerText(value: boolean | null | undefined): string {
  if (value === true) return t("app.common.yes");
  if (value === false) return t("app.common.no");
  return "—";
}
function valueClass(value: boolean | null | undefined): string {
  return value === true ? "sb-form__value--yes" : value === false ? "sb-form__value--no" : "sb-form__value--empty";
}
const formatNumber = (value: number) => value.toLocaleString(intlLocale(locale.value), { maximumFractionDigits: 1 });
</script>

<style scoped>
.sb-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  container-type: inline-size;
}
@media (min-width: 900px) {
  .sb-form {
    grid-template-columns: minmax(0, 1fr) 200px;
    align-items: start;
  }
  .sb-form__side {
    position: sticky;
    top: 0;
  }
}
.sb-form__side {
  padding: 12px;
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-primary), 0.06);
}
.sb-form__section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 2px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}
.sb-form__section:first-child {
  margin-top: 0;
}
.sb-form__section::after {
  content: "";
  flex: 1;
  border-top: 1px solid rgb(var(--v-theme-outline-variant));
}
.sb-form__stamp {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.sb-form__stamp-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: rgb(var(--v-theme-primary));
}
.sb-form__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
  flex-wrap: wrap;
}
.sb-form__letter {
  width: 26px;
  flex: none;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
}
.sb-form__icon {
  width: 22px;
  height: 22px;
  flex: none;
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.55);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sb-form__question {
  flex: 1 1 0;
  min-width: 0;
  font-size: 0.9375rem;
  line-height: 1.35;
}
.sb-form__question small {
  display: block;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}
.sb-form__inputs {
  display: flex;
  gap: 8px;
}
.sb-form__input {
  width: 112px;
  flex: none;
}
.sb-form__value {
  min-width: 56px;
  text-align: center;
  font-weight: 600;
  font-size: 0.875rem;
  border-radius: 999px;
  padding: 3px 10px;
}
.sb-form__value--yes { background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); }
.sb-form__value--no { background: rgba(var(--v-theme-primary), 0.1); color: rgb(var(--v-theme-primary)); }
.sb-form__value--empty { color: rgba(var(--v-theme-on-surface), 0.5); }
.sb-form__value--auto { box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.35); }
.sb-form__error {
  margin: 4px 0 0 36px;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-error));
}
/* Phone: the measurement inputs take their own line under the question. */
@container (max-width: 520px) {
  .sb-form__row--measure .sb-form__inputs {
    order: 5;
    width: 100%;
    padding-left: 36px;
  }
}
</style>
