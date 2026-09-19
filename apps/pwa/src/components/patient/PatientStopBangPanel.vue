<template>
  <div class="stop-bang">
    <h3 class="stop-bang__section-title">{{ t("app.patients.stopBang.newScreening") }}</h3>
    <div v-for="q in questions" :key="q.key" class="stop-bang__row">
      <span class="stop-bang__label">{{ t(q.labelKey) }}</span>
      <VBtnToggle v-model="answers[q.key]" density="comfortable" color="primary" divided>
        <VBtn :value="true" size="small">{{ t("app.common.yes") }}</VBtn>
        <VBtn :value="false" size="small">{{ t("app.common.no") }}</VBtn>
      </VBtnToggle>
    </div>
    <AppButton color="primary" class="stop-bang__record-btn" :loading="recording" :disabled="!allAnswered" @click="onRecord">
      {{ t("app.patients.stopBang.record") }}
    </AppButton>

    <h3 class="stop-bang__section-title stop-bang__history-title">{{ t("app.patients.stopBang.history") }}</h3>
    <AppLoadingState v-if="loading" />
    <p v-else-if="screenings.length === 0" class="stop-bang__empty">{{ t("app.patients.stopBang.empty") }}</p>
    <ul v-else class="stop-bang__list">
      <li v-for="s in screenings" :key="s.id" class="stop-bang__item">
        <span class="stop-bang__score">{{ t("app.patients.stopBang.scoreLabel") }} {{ s.score }}/8</span>
        <span class="stop-bang__date">{{ new Date(s.created_at).toLocaleDateString() }}</span>
        <AppButton variant="text" size="small" :loading="generatingPdfId === s.id" @click="onGeneratePdf(s.id)">
          {{ t("app.patients.stopBang.generatePdf") }}
        </AppButton>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * STOP-Bang OSA screening — append-only (recurring instrument, unlike
 * endo_intake's one-row-per-patient shape, see ADR-022) — a new-screening
 * form above a history list, each past screening downloadable as its own
 * PDF. All 8 items are required per RecordStopBangScreeningCommand's own
 * validation — the "Record" button stays disabled until every question has
 * an answer, so the 400 from an incomplete submit is a defense-in-depth
 * backstop, not the primary UX guard.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { VBtnToggle, VBtn } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppLoadingState from "../AppLoadingState.vue";
import { apiFetch } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";

const props = defineProps<{ patientId: string }>();

const { t } = useI18n();
const notifications = useNotifications();

type StopBangKey =
  | "snoring" | "tiredness" | "observed_apnea" | "pressure"
  | "bmi_over_35" | "age_over_50" | "neck_circumference_over_40cm" | "is_male";

interface StopBangScreening {
  id: string;
  score: number;
  created_at: string;
}

const questions: { key: StopBangKey; labelKey: string }[] = [
  { key: "snoring", labelKey: "app.patients.stopBang.q.snoring" },
  { key: "tiredness", labelKey: "app.patients.stopBang.q.tiredness" },
  { key: "observed_apnea", labelKey: "app.patients.stopBang.q.observedApnea" },
  { key: "pressure", labelKey: "app.patients.stopBang.q.pressure" },
  { key: "bmi_over_35", labelKey: "app.patients.stopBang.q.bmiOver35" },
  { key: "age_over_50", labelKey: "app.patients.stopBang.q.ageOver50" },
  { key: "neck_circumference_over_40cm", labelKey: "app.patients.stopBang.q.neckCircumference" },
  { key: "is_male", labelKey: "app.patients.stopBang.q.isMale" },
];

const answers = ref<Record<StopBangKey, boolean | null>>({
  snoring: null, tiredness: null, observed_apnea: null, pressure: null,
  bmi_over_35: null, age_over_50: null, neck_circumference_over_40cm: null, is_male: null,
});

const loading = ref(true);
const recording = ref(false);
const generatingPdfId = ref<string | null>(null);
const screenings = ref<StopBangScreening[]>([]);

const allAnswered = computed(() => Object.values(answers.value).every((v) => v !== null));

async function loadScreenings(): Promise<void> {
  loading.value = true;
  try {
    const res = await apiFetch(`/api/v1/patient/${props.patientId}/stop-bang`, { handleErrors: false });
    if (res.ok) {
      screenings.value = (await res.json()) as StopBangScreening[];
    } else {
      notifications.show(t("app.patients.stopBang.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("app.patients.stopBang.errorLoad"), "error");
  } finally {
    loading.value = false;
  }
}

async function onRecord(): Promise<void> {
  if (recording.value || !allAnswered.value) return;
  recording.value = true;
  try {
    const res = await apiFetch(`/api/v1/patient/${props.patientId}/stop-bang`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers.value),
    });
    if (res.ok) {
      notifications.show(t("app.patients.stopBang.recordSuccess"), "success");
      for (const key of Object.keys(answers.value) as StopBangKey[]) answers.value[key] = null;
      await loadScreenings();
    } else {
      notifications.show(t("app.patients.stopBang.recordError"), "error");
    }
  } catch {
    notifications.show(t("app.patients.stopBang.recordError"), "error");
  } finally {
    recording.value = false;
  }
}

async function onGeneratePdf(screeningId: string): Promise<void> {
  generatingPdfId.value = screeningId;
  try {
    const res = await apiFetch(`/api/v1/patient/${props.patientId}/stop-bang/${screeningId}/generate-pdf`, { method: "POST" });
    if (res.ok) {
      notifications.show(t("app.patients.stopBang.generatePdfSuccess"), "success");
    } else {
      notifications.show(t("app.patients.stopBang.generatePdfError"), "error");
    }
  } catch {
    notifications.show(t("app.patients.stopBang.generatePdfError"), "error");
  } finally {
    generatingPdfId.value = null;
  }
}

onMounted(loadScreenings);
</script>

<style scoped>
.stop-bang__section-title {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 10px;
}
.stop-bang__history-title {
  margin-top: 24px;
}
.stop-bang__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.stop-bang__label {
  flex: 1;
}
.stop-bang__record-btn {
  margin-top: 16px;
}
.stop-bang__empty {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.stop-bang__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stop-bang__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.stop-bang__score {
  font-weight: 600;
}
.stop-bang__date {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}
</style>
