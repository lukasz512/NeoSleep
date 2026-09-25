<template>
  <div class="patient-questionnaire">
    <AuthChrome />

    <AuthCard class="patient-questionnaire__card" :title="cardTitle" :loading="phase === 'loading' || submitting" :step-key="stepKey">
      <div v-if="phase === 'loading'" class="patient-questionnaire__body">
        <AppLoadingState />
      </div>

      <div v-else-if="phase === 'invalid'" class="patient-questionnaire__body" role="alert">
        <p>{{ t("app.questionnaire.invalid.body") }}</p>
      </div>

      <div v-else-if="phase === 'unreachable'" class="patient-questionnaire__body" role="alert">
        <p>{{ t("app.questionnaire.error") }}</p>
        <AppButton color="primary" size="large" block @click="load">{{ t("app.errorState.refresh") }}</AppButton>
      </div>

      <div v-else-if="phase === 'submitted'" class="patient-questionnaire__body patient-questionnaire__done" role="status">
        <AppIcon name="check-circle" class="patient-questionnaire__done-icon" />
        <p>{{ t("app.questionnaire.thanks.body") }}</p>
      </div>

      <div v-else-if="questionnaire && step" class="patient-questionnaire__body">
        <div v-if="totalSteps > 1" class="patient-questionnaire__progress">
          <span>{{ t("app.questionnaire.step", { n: stepNumber, total: totalSteps }) }} · {{ stepTitle(step) }}</span>
          <VProgressLinear :model-value="(stepNumber - 1) / totalSteps * 100" color="primary" height="6" rounded :aria-label="t('app.questionnaire.step', { n: stepNumber, total: totalSteps })" />
        </div>
        <p v-if="stepNumber === 1" class="patient-questionnaire__intro">
          {{ totalSteps > 1
            ? t("app.questionnaire.intro.bundle", { clinic: clinicName, n: totalSteps })
            : t(`app.questionnaire.intro.${step.type === "stop_bang" ? "stopBang" : step.type === "consent" ? "consent" : "medicalHistory"}`, { clinic: clinicName }) }}
        </p>

        <!-- Consent: read the document, sign with a finger. -->
        <form v-if="step.type === 'consent'" novalidate @submit.prevent="submitConsent">
          <h2 class="patient-questionnaire__step-title">{{ stepTitle(step) }}</h2>
          <template v-if="step.consent_html">
            <p class="patient-questionnaire__prompt">{{ t("app.questionnaire.consentStep.read") }}</p>
            <!-- Server-sanitized to a tag allowlist (p, br, strong, em, u, ul, ol, li; no attributes) — commands/documentContent.ts sanitizeDocumentContentHtml. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="patient-questionnaire__document" tabindex="0" v-html="step.consent_html" />
            <p class="patient-questionnaire__sign-label">{{ t("app.questionnaire.consentStep.signLabel") }}</p>
            <SignaturePad ref="signaturePadRef" :placeholder="t('app.questionnaire.consentStep.signHere')" :clear-label="t('app.questionnaire.consentStep.clear')" />
            <VAlert v-if="showMissing" type="warning" variant="tonal" density="compact" class="patient-questionnaire__alert">
              {{ t("app.questionnaire.consentStep.missingSignature") }}
            </VAlert>
            <VAlert v-if="submitError" type="error" variant="tonal" density="compact" class="patient-questionnaire__alert">
              {{ t("app.questionnaire.error") }}
            </VAlert>
            <AppButton type="submit" color="primary" size="large" block :loading="submitting">{{ t("app.questionnaire.consentStep.signAndContinue") }}</AppButton>
          </template>
          <template v-else>
            <VAlert type="info" variant="tonal" class="patient-questionnaire__alert">{{ t("app.questionnaire.consentStep.unavailable") }}</VAlert>
            <AppButton color="primary" size="large" block @click="skip">{{ t("app.questionnaire.next") }}</AppButton>
          </template>
        </form>

        <!-- Health questionnaires: layered notice + yes/no + express consent. -->
        <form v-else novalidate @submit.prevent="submitQuestionnaire">
          <h2 v-if="totalSteps > 1" class="patient-questionnaire__step-title">{{ stepTitle(step) }}</h2>
          <p v-if="step.type === 'medical_history'" class="patient-questionnaire__prompt">{{ t("app.questionnaire.prompt.medicalHistory") }}</p>
          <QuestionnaireChecklist v-model="answers" :questions="questions" large :highlight-unanswered="showMissing" />
          <VTextarea
            v-if="step.type === 'medical_history'"
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
            {{ stepNumber < totalSteps ? t("app.questionnaire.saveAndContinue") : t("app.questionnaire.submit") }}
          </AppButton>
        </form>
      </div>
    </AuthCard>
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { AuthChrome, AuthCard } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import SignaturePad from "../components/SignaturePad.vue";
import QuestionnaireChecklist from "../components/questionnaire/QuestionnaireChecklist.vue";
import ConsentNotice from "../components/questionnaire/ConsentNotice.vue";
import { apiFetch } from "../composables/useApi";
import { MEDICAL_HISTORY_QUESTIONS, STOP_QUESTIONS, checklistItemTitle } from "../config/questionnaires";

/**
 * Public patient page, opened from the QR code a doctor shows (route
 * /q#<token>, no login — the patient has no account). One link can hold
 * several steps — sign the informed consent, answer the medical history,
 * answer S-T-O-P — done one after another, each saved on its own (a patient
 * interrupted halfway keeps what they finished). The token is the only
 * credential: single-use per step, 24h, validated server-side
 * (routes/public.ts). Shows only the patient's first name + clinic.
 */
interface PublicStep {
  key: string;
  type: "consent" | "medical_history" | "stop_bang";
  done: boolean;
  label: string;
  consent_html?: string | null;
}
interface PublicQuestionnaire {
  patient_first_name: string;
  clinic_name: string | null;
  clinic_email: string | null;
  privacy_notice_url: string;
  steps: PublicStep[];
}

const route = useRoute();
const { t, locale } = useI18n();
// /q#<token> — the fragment never leaves the browser (no server log, no
// analytics, no Referer); it's sent to the API only in a POST body.
// Computed + watched: a second link opened in the same tab changes only the
// fragment, which doesn't reload the page.
const token = computed(() => route.hash.replace(/^#/, ""));

/** invalid = the link is dead (410); unreachable = anything else (offline, 429, cold start) — retryable, never told "invalid". */
const phase = ref<"loading" | "invalid" | "unreachable" | "steps" | "submitted">("loading");
const questionnaire = ref<PublicQuestionnaire | null>(null);
const skipped = ref(new Set<string>());
const answers = ref<Record<string, boolean | null>>({});
const other = ref("");
const consent = ref(false);
const submitting = ref(false);
const submitError = ref(false);
const showMissing = ref(false);
const signaturePadRef = ref<InstanceType<typeof SignaturePad> | null>(null);

const steps = computed(() => questionnaire.value?.steps ?? []);
const totalSteps = computed(() => steps.value.length);
const step = computed(() => steps.value.find((s) => !s.done && !skipped.value.has(s.key)) ?? null);
const stepNumber = computed(() => (step.value ? steps.value.indexOf(step.value) + 1 : totalSteps.value));
const stepKey = computed(() => (phase.value === "steps" ? `step-${step.value?.key ?? "none"}` : phase.value));

const questions = computed(() => (step.value?.type === "stop_bang" ? STOP_QUESTIONS : MEDICAL_HISTORY_QUESTIONS));
const clinicName = computed(() => questionnaire.value?.clinic_name || t("app.questionnaire.yourClinic"));
const allAnswered = computed(() => questions.value.every((q) => answers.value[q.key] != null));

function stepTitle(s: PublicStep): string {
  return checklistItemTitle(t, s.key, s.label);
}

const cardTitle = computed(() => {
  if (phase.value === "invalid") return t("app.questionnaire.invalid.title");
  if (phase.value === "submitted") return t("app.questionnaire.thanks.title");
  if (questionnaire.value) return t("app.questionnaire.greeting", { name: questionnaire.value.patient_first_name });
  return null;
});

function post(path: "lookup" | "submit", body: Record<string, unknown>): Promise<Response> {
  return apiFetch(`/api/v1/public/questionnaire/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.value, locale: locale.value, ...body }),
    handleErrors: false,
  });
}

function resetStepState() {
  answers.value = Object.fromEntries(questions.value.map((q) => [q.key, null]));
  other.value = "";
  consent.value = false;
  showMissing.value = false;
  submitError.value = false;
}

async function load() {
  if (!token.value) {
    phase.value = "invalid";
    return;
  }
  phase.value = "loading";
  questionnaire.value = null;
  skipped.value = new Set();
  try {
    const res = await post("lookup", {});
    if (res.status === 410) {
      phase.value = "invalid";
      return;
    }
    if (!res.ok) {
      await reportFailedResponse(res, { where: "PatientQuestionnaireView.load" });
      phase.value = "unreachable";
      return;
    }
    questionnaire.value = (await res.json()) as PublicQuestionnaire;
    phase.value = step.value ? "steps" : "submitted";
    resetStepState();
  } catch (err) {
    reportCaught(err, { where: "PatientQuestionnaireView.load" });
    phase.value = "unreachable";
  }
}

onMounted(load);
watch(token, load);

function advance(completedKey: string, linkCompleted: boolean) {
  const done = steps.value.find((s) => s.key === completedKey);
  if (done) done.done = true;
  if (linkCompleted || !step.value) phase.value = "submitted";
  resetStepState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** A consent whose text isn't authored yet can't be signed here — skip it (the clinic can resend it later). */
function skip() {
  if (!step.value) return;
  skipped.value = new Set([...skipped.value, step.value.key]);
  if (!step.value) phase.value = "submitted";
  resetStepState();
}

async function send(body: Record<string, unknown>) {
  submitting.value = true;
  submitError.value = false;
  try {
    const res = await post("submit", body);
    if (res.status === 410) {
      phase.value = "invalid";
      return;
    }
    if (!res.ok) {
      // A patient's answers failed to save — must never be silent. Status/code only, never the answers.
      await reportFailedResponse(res, { where: "PatientQuestionnaireView.send" });
      submitError.value = true;
      return;
    }
    const result = (await res.json()) as { step: string; completed: boolean };
    advance(result.step, result.completed);
  } catch (err) {
    reportCaught(err, { where: "PatientQuestionnaireView.send" });
    submitError.value = true;
  } finally {
    submitting.value = false;
  }
}

async function submitConsent() {
  showMissing.value = true;
  const signature = signaturePadRef.value?.isEmpty() ? null : signaturePadRef.value?.toDataURL();
  if (!signature || !step.value) return;
  await send({ step: step.value.key, signatureDataUrl: signature });
}

async function submitQuestionnaire() {
  showMissing.value = true;
  if (!allAnswered.value || !consent.value || !step.value) return;
  const payload: Record<string, unknown> = { ...answers.value };
  if (step.value.type === "medical_history") payload.medical_history_other = other.value.trim() || null;
  await send({ step: step.value.key, consent: true, answers: payload });
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

.patient-questionnaire__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.patient-questionnaire__intro {
  margin: 0 0 16px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.patient-questionnaire__step-title {
  margin: 0 0 8px;
  font-size: 1.125rem;
  font-weight: 600;
}

.patient-questionnaire__prompt {
  margin: 0 0 4px;
  font-weight: 600;
}

.patient-questionnaire__document {
  max-height: 45vh;
  overflow-y: auto;
  margin: 8px 0 16px;
  padding: 12px 14px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.03);
  font-size: 0.9375rem;
  line-height: 1.5;
}
.patient-questionnaire__document :deep(p) {
  margin: 0 0 10px;
}

.patient-questionnaire__sign-label {
  margin: 0 0 6px;
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
  margin: 12px 0 16px;
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
