<template>
  <div class="patient-questionnaire">
    <AuthChrome />

    <AuthCard class="patient-questionnaire__card" :title="cardTitle" :loading="step === 'loading' || submitting" :step-key="step">
      <div v-if="step === 'loading'" class="patient-questionnaire__body">
        <AppLoadingState />
      </div>

      <div v-else-if="step === 'invalid'" class="patient-questionnaire__body" role="alert">
        <p>{{ t("app.questionnaire.invalid.body") }}</p>
      </div>

      <div v-else-if="step === 'unreachable'" class="patient-questionnaire__body" role="alert">
        <p>{{ t("app.questionnaire.error") }}</p>
        <AppButton color="primary" size="large" block @click="load">{{ t("app.errorState.refresh") }}</AppButton>
      </div>

      <div v-else-if="step === 'submitted'" class="patient-questionnaire__body patient-questionnaire__done" role="status">
        <AppIcon name="check-circle" class="patient-questionnaire__done-icon" />
        <p>{{ t("app.questionnaire.thanks.body") }}</p>
      </div>

      <form v-else-if="questionnaire" class="patient-questionnaire__body" novalidate @submit.prevent="onSubmit">
        <p class="patient-questionnaire__intro">{{ t(`app.questionnaire.intro.${introKey}`, { clinic: clinicName }) }}</p>

        <p v-if="questionnaire.kind === 'medical_history'" class="patient-questionnaire__prompt">
          {{ t("app.questionnaire.prompt.medicalHistory") }}
        </p>
        <QuestionnaireChecklist v-model="answers" :questions="questions" large :highlight-unanswered="showMissing" />

        <VTextarea
          v-if="questionnaire.kind === 'medical_history'"
          v-model="other"
          :label="t('app.questionnaire.otherPlaceholder')"
          variant="outlined"
          rows="2"
          auto-grow
          maxlength="500"
          class="patient-questionnaire__other"
        />

        <ConsentNotice :clinic="clinicName" :clinic-email="questionnaire.clinic_email" :privacy-notice-url="questionnaire.privacy_notice_url" />

        <VCheckbox v-model="consent" hide-details class="patient-questionnaire__consent">
          <template #label>{{ t("app.questionnaire.consent", { clinic: clinicName }) }}</template>
        </VCheckbox>

        <VAlert v-if="showMissing && !allAnswered" type="warning" variant="tonal" density="compact" class="patient-questionnaire__alert">
          {{ t("app.questionnaire.answerAll") }}
        </VAlert>
        <VAlert v-if="submitError" type="error" variant="tonal" density="compact" class="patient-questionnaire__alert">
          {{ t("app.questionnaire.error") }}
        </VAlert>

        <AppButton type="submit" color="primary" size="large" block :loading="submitting" :disabled="!consent">
          {{ t("app.questionnaire.submit") }}
        </AppButton>
      </form>
    </AuthCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { AuthChrome, AuthCard } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import QuestionnaireChecklist from "../components/questionnaire/QuestionnaireChecklist.vue";
import ConsentNotice from "../components/questionnaire/ConsentNotice.vue";
import { apiFetch } from "../composables/useApi";
import { MEDICAL_HISTORY_QUESTIONS, STOP_QUESTIONS, type PatientFillableKind } from "../config/questionnaires";

/**
 * Public patient self-fill page, opened from the QR code a doctor shows
 * (route /q#<token>, no login — the patient has no account). The token is
 * the only credential: single-use, 24h, validated server-side
 * (routes/public.ts). Shows only the patient's first name + clinic. For
 * STOP-Bang the patient answers S-T-O-P only; the doctor completes B-A-N-G.
 */
interface PublicQuestionnaire {
  kind: PatientFillableKind;
  patient_first_name: string;
  clinic_name: string | null;
  clinic_email: string | null;
  privacy_notice_url: string;
}

const route = useRoute();
const { t } = useI18n();
// /q#<token> — the fragment never leaves the browser (no server log, no
// analytics, no Referer); it's sent to the API only in a POST body.
// Computed + watched below: opening a second link in the same tab (the
// STOP-Bang QR after the medical-history one) changes only the fragment,
// which doesn't reload the page.
const token = computed(() => route.hash.replace(/^#/, ""));

/** invalid = the link is dead (410); unreachable = anything else (offline, 429, cold start) — retryable, so never told "invalid". */
const step = ref<"loading" | "invalid" | "unreachable" | "form" | "submitted">("loading");
const questionnaire = ref<PublicQuestionnaire | null>(null);
const answers = ref<Record<string, boolean | null>>({});
const other = ref("");
const consent = ref(false);
const submitting = ref(false);
const submitError = ref(false);
const showMissing = ref(false);

const questions = computed(() => (questionnaire.value?.kind === "stop_bang" ? STOP_QUESTIONS : MEDICAL_HISTORY_QUESTIONS));
const introKey = computed(() => (questionnaire.value?.kind === "stop_bang" ? "stopBang" : "medicalHistory"));
const clinicName = computed(() => questionnaire.value?.clinic_name || t("app.questionnaire.yourClinic"));
const allAnswered = computed(() => questions.value.every((q) => answers.value[q.key] != null));

const cardTitle = computed(() => {
  if (step.value === "invalid") return t("app.questionnaire.invalid.title");
  if (step.value === "submitted") return t("app.questionnaire.thanks.title");
  if (questionnaire.value) return t("app.questionnaire.greeting", { name: questionnaire.value.patient_first_name });
  return null;
});

function post(path: "lookup" | "submit", body: Record<string, unknown>): Promise<Response> {
  return apiFetch(`/api/v1/public/questionnaire/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.value, ...body }),
    handleErrors: false,
  });
}

async function load() {
  if (!token.value) {
    step.value = "invalid";
    return;
  }
  step.value = "loading";
  questionnaire.value = null;
  other.value = "";
  consent.value = false;
  showMissing.value = false;
  submitError.value = false;
  try {
    const res = await post("lookup", {});
    if (res.status === 410) {
      step.value = "invalid";
      return;
    }
    if (!res.ok) {
      step.value = "unreachable";
      return;
    }
    questionnaire.value = (await res.json()) as PublicQuestionnaire;
    answers.value = Object.fromEntries(questions.value.map((q) => [q.key, null]));
    step.value = "form";
  } catch {
    step.value = "unreachable";
  }
}

onMounted(load);
watch(token, load);

async function onSubmit() {
  showMissing.value = true;
  submitError.value = false;
  if (!allAnswered.value || !consent.value) return;

  submitting.value = true;
  try {
    const payload: Record<string, unknown> = { ...answers.value };
    if (questionnaire.value?.kind === "medical_history") payload.medical_history_other = other.value.trim() || null;
    const res = await post("submit", { consent: true, answers: payload });
    if (res.status === 410) step.value = "invalid";
    else if (res.ok) step.value = "submitted";
    else submitError.value = true;
  } catch {
    submitError.value = true;
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.patient-questionnaire {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow-y: auto;
  padding: 24px 16px 40px;
  padding-top: clamp(24px, 8vh, 80px);
}

.patient-questionnaire__card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
}

.patient-questionnaire__body {
  padding: 8px 24px 28px;
}

.patient-questionnaire__intro {
  margin: 0 0 16px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.patient-questionnaire__prompt {
  margin: 0 0 4px;
  font-weight: 600;
}

.patient-questionnaire__other {
  margin-top: 16px;
}

.patient-questionnaire__consent {
  margin: 12px 0 16px;
  align-items: flex-start;
}

.patient-questionnaire__alert {
  margin-bottom: 16px;
}

.patient-questionnaire__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.patient-questionnaire__done-icon {
  width: 56px;
  height: 56px;
  color: rgb(var(--v-theme-success));
}

@media (max-width: 480px) {
  .patient-questionnaire__body {
    padding: 8px 16px 24px;
  }
}
</style>
