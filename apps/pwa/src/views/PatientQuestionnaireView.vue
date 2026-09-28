<template>
  <div class="patient-questionnaire">
    <PatientTopBar
      :first-name="questionnaire && (phase === 'steps' || phase === 'submitted') ? questionnaire.patient_first_name : null"
      :clinic="clinicName"
      :clinic-email="questionnaire?.clinic_email ?? null"
      :clinic-phone="questionnaire?.clinic_phone ?? null"
      :privacy-url="questionnaire?.privacy_notice_url ?? ''"
      :website-url="questionnaire?.website_url ?? ''"
    />

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
        <!-- The check draws itself inside a fixed 96px box: the card never changes size while it animates (option C, Łukasz 2026-09-26). -->
        <span class="patient-questionnaire__done-mark" aria-hidden="true">
          <svg viewBox="0 0 68 68" class="patient-questionnaire__done-check">
            <circle class="patient-questionnaire__done-circle" cx="34" cy="34" r="30" pathLength="1" />
            <path class="patient-questionnaire__done-tick" d="M21 35l9 9 17-19" pathLength="1" />
          </svg>
        </span>
        <h1 class="patient-questionnaire__done-title">
          {{ consentOnly
            ? t("app.questionnaire.thanks.signedTitle")
            : questionnaire ? t("app.questionnaire.thanks.titleName", { name: questionnaire.patient_first_name }) : t("app.questionnaire.thanks.title") }}
        </h1>
        <p class="patient-questionnaire__done-text">
          {{ consentOnly && questionnaire
            ? t("app.questionnaire.thanks.signedText", { name: questionnaire.patient_first_name, clinic: clinicName })
            : t("app.questionnaire.thanks.sent", { clinic: clinicName }) }}
        </p>
        <!-- One receipt per document signed on this visit, with its PDF copy (handed back once by the server, NEO-126). -->
        <div v-for="copy in signedCopies" :key="copy.filename" class="patient-questionnaire__receipt" data-testid="signed-receipt">
          <dl class="patient-questionnaire__receipt-rows">
            <div><dt>{{ t("app.questionnaire.thanks.receipt.document") }}</dt><dd>{{ copy.title }}</dd></div>
            <div><dt>{{ t("app.questionnaire.thanks.receipt.signedAt") }}</dt><dd>{{ formatStamp(copy.signedAt) }}</dd></div>
            <div><dt>{{ t("app.questionnaire.thanks.receipt.clinic") }}</dt><dd>{{ clinicName }}</dd></div>
          </dl>
          <AppButton variant="tonal" color="primary" block class="patient-questionnaire__download" @click="downloadCopy(copy)">
            <AppIcon name="download" class="patient-questionnaire__download-icon" />
            {{ t("app.questionnaire.thanks.download") }}
          </AppButton>
        </div>
        <!-- What happens next — the patient knows nothing else is expected of them. -->
        <ol class="patient-questionnaire__next">
          <li class="patient-questionnaire__next-item patient-questionnaire__next-item--done">
            <span class="patient-questionnaire__next-dot"><AppIcon name="check" /></span>{{ t(consentOnly ? "app.questionnaire.thanks.next.signed" : "app.questionnaire.thanks.next.done") }}
          </li>
          <li class="patient-questionnaire__next-item">
            <span class="patient-questionnaire__next-dot">2</span>{{ t("app.questionnaire.thanks.next.review") }}
          </li>
          <li class="patient-questionnaire__next-item">
            <span class="patient-questionnaire__next-dot">3</span>{{ t("app.questionnaire.thanks.next.close") }}
          </li>
        </ol>
      </div>

      <div v-else-if="questionnaire && step" class="patient-questionnaire__body">
        <span class="patient-questionnaire__secure" data-testid="secure-chip">
          <AppIcon name="lock" class="patient-questionnaire__secure-icon" />{{ t("app.questionnaire.secureLink") }}
        </span>
        <AppSegmentProgress
          v-if="totalSteps > 1"
          class="patient-questionnaire__progress"
          :segments="stepSegments"
          :label="t('app.questionnaire.step', { n: stepNumber, total: totalSteps })"
          :meta="stepTitle(step)"
        />
        <p v-if="stepNumber === 1" class="patient-questionnaire__intro">
          {{ totalSteps > 1
            ? t("app.questionnaire.intro.bundle", { clinic: clinicName, n: totalSteps })
            : t(`app.questionnaire.intro.${step.type === "stop_bang" ? "stopBang" : step.type === "consent" ? "consent" : "medicalHistory"}`, { clinic: clinicName }) }}
        </p>

        <!-- Consent (NEO-126): the document is a card that opens a reader; signing unlocks once it's been read to the end. -->
        <form v-if="step.type === 'consent'" novalidate @submit.prevent="submitConsent">
          <h2 v-if="totalSteps > 1" class="patient-questionnaire__step-title">{{ stepTitle(step) }}</h2>
          <template v-if="step.consent_html">
            <!-- One document on the link: read → sign → done on the app's one segmented bar (NEO-127). -->
            <AppSegmentProgress
              v-if="totalSteps === 1"
              class="patient-questionnaire__progress"
              :segments="consentSegments"
              :label="t(`app.questionnaire.consentStep.phase.${CONSENT_PHASES[consentPhase - 1]}`)"
              :meta="`${consentPhase} / ${CONSENT_PHASES.length}`"
            />
            <p v-if="!docRead" class="patient-questionnaire__prompt">{{ t("app.questionnaire.consentStep.read") }}</p>

            <button
              type="button"
              class="patient-questionnaire__doc"
              :class="{ 'patient-questionnaire__doc--read': docRead }"
              data-testid="consent-document-card"
              @click="readerOpen = true"
            >
              <span class="patient-questionnaire__doc-sheet" aria-hidden="true">
                <span class="patient-questionnaire__doc-badge"><AppIcon name="pencil" /></span>
              </span>
              <span class="patient-questionnaire__doc-text">
                <strong>{{ stepTitle(step) }}</strong>
                <span>{{ clinicName }} · {{ t("app.questionnaire.consentStep.readingTime", { min: readingMinutes }) }}</span>
              </span>
              <span class="patient-questionnaire__doc-go">
                <template v-if="docRead"><AppIcon name="check" class="patient-questionnaire__doc-go-icon" />{{ t("app.questionnaire.consentStep.readDone") }}</template>
                <template v-else>{{ t("app.questionnaire.consentStep.open") }} <AppIcon name="chevron-right" class="patient-questionnaire__doc-go-icon" /></template>
              </span>
            </button>

            <Transition name="view-fade-lift">
              <div v-if="docRead" class="patient-questionnaire__sign">
                <p class="patient-questionnaire__sign-label">{{ t("app.questionnaire.consentStep.signLabel") }}</p>
                <ConsentSignatureField ref="signaturePadRef" @change="signed = !$event" />
                <!-- Who signs and when — shown before the tap, the same data the PDF will carry. -->
                <p class="patient-questionnaire__signer" data-testid="consent-signer">
                  <strong>{{ t("app.questionnaire.consentStep.signer", { name: signerName, date: formatStamp(signingAt) }) }}</strong>
                  <span>{{ t("app.questionnaire.consentStep.signerNote") }}</span>
                </p>
                <VCheckbox v-model="accepted" hide-details class="patient-questionnaire__consent" data-testid="consent-accept">
                  <template #label>{{ t("app.questionnaire.consentStep.accept") }}</template>
                </VCheckbox>
              </div>
            </Transition>
            <AppInlineAlert
              v-if="showMissing && !signed"
              type="warning"
              class="patient-questionnaire__alert"
              :title="t('app.questionnaire.consentStep.missingSignature')"
            />
            <AppInlineAlert
              v-else-if="showMissing && !accepted"
              type="warning"
              class="patient-questionnaire__alert"
              :title="t('app.questionnaire.consentStep.missingAccept')"
            />
            <AppInlineAlert v-if="submitError" type="error" class="patient-questionnaire__alert">
              {{ t("app.questionnaire.error") }}
            </AppInlineAlert>
            <AppButton v-if="!docRead" color="primary" size="large" block class="patient-questionnaire__cta" @click="readerOpen = true">
              {{ t("app.questionnaire.consentStep.readCta") }}
            </AppButton>
            <AppButton
              v-else
              type="submit"
              color="primary"
              size="large"
              block
              :loading="submitting"
              class="patient-questionnaire__cta"
              :class="{ 'patient-questionnaire__send--locked': !canSign }"
              :aria-disabled="!canSign"
            >
              {{ stepNumber < totalSteps ? t("app.questionnaire.consentStep.signAndContinue") : t("app.questionnaire.consentStep.sign") }}
            </AppButton>
            <ConsentDocumentReader
              v-model="readerOpen"
              :title="stepTitle(step)"
              :subtitle="`${clinicName} · ${t('app.questionnaire.consentStep.readingTime', { min: readingMinutes })}`"
              :html="step.consent_html"
              :patient-name="questionnaire.patient_name"
              @read="onDocumentRead"
            />
          </template>
          <template v-else>
            <AppInlineAlert type="info" class="patient-questionnaire__alert">{{ t("app.questionnaire.consentStep.unavailable") }}</AppInlineAlert>
            <AppButton color="primary" size="large" block @click="skip">{{ t("app.questionnaire.next") }}</AppButton>
          </template>
        </form>

        <!-- Health questionnaires: layered notice + yes/no + express consent. -->
        <form v-else novalidate @submit.prevent="submitQuestionnaire">
          <h2 v-if="totalSteps > 1" class="patient-questionnaire__step-title">{{ stepTitle(step) }}</h2>
          <p v-if="step.type === 'medical_history'" class="patient-questionnaire__prompt">{{ t("app.questionnaire.prompt.medicalHistory") }}</p>
          <!-- STOP-Bang: card by card (4 questions, illustrated). Medical history: one list — 14 plain yes/no
               questions read faster on one screen (Łukasz, 2026-09-26). -->
          <QuestionnaireCards v-if="useCards" v-model="answers" v-model:cursor="cursor" :questions="questions" letters />
          <QuestionnaireChecklist v-else v-model="answers" :questions="questions" large :highlight-unanswered="showMissing" />
          <!-- After the last card (or under the list): anything else, consent (its data notice folded under it), send. -->
          <Transition name="view-fade-lift">
            <div v-if="!useCards || cursor >= questions.length" class="patient-questionnaire__finish">
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
              <VCheckbox v-model="consent" hide-details class="patient-questionnaire__consent">
                <template #label>{{ t("app.questionnaire.consent", { clinic: clinicName }) }}</template>
              </VCheckbox>
              <ConsentNotice :clinic="clinicName" :clinic-email="questionnaire.clinic_email" :privacy-notice-url="questionnaire.privacy_notice_url" />
              <!-- What still blocks Send, right above it (NEO-105: inline, not a toast — it belongs to this form). -->
              <AppInlineAlert
                v-if="showMissing && !allAnswered"
                type="warning"
                class="patient-questionnaire__alert"
                :title="t('app.questionnaire.missing.questions', { n: unansweredCount })"
                :text="t('app.questionnaire.missing.questionsHint')"
                :action-label="t('app.questionnaire.missing.goToFirst')"
                @action="goToFirstMissing"
              />
              <AppInlineAlert
                v-else-if="showMissing && !consent"
                type="warning"
                class="patient-questionnaire__alert"
                :title="t('app.questionnaire.missing.consent')"
              />
              <AppInlineAlert v-if="submitError" type="error" class="patient-questionnaire__alert">
                {{ t("app.questionnaire.error") }}
              </AppInlineAlert>
              <!-- Locked until every question is answered and consent is ticked; a tap while locked shows what's missing above (NEO-99). -->
              <AppButton
                type="submit"
                color="primary"
                size="large"
                block
                :loading="submitting"
                :class="{ 'patient-questionnaire__send--locked': !canSend }"
                :aria-disabled="!canSend"
              >
                {{ stepNumber < totalSteps ? t("app.questionnaire.saveAndContinue") : t("app.questionnaire.submit") }}
              </AppButton>
            </div>
          </Transition>
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
import { AuthCard } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppSegmentProgress, { type SegmentState } from "../components/AppSegmentProgress.vue";
import ConsentSignatureField from "../components/questionnaire/ConsentSignatureField.vue";
import ConsentDocumentReader from "../components/questionnaire/ConsentDocumentReader.vue";
import PatientTopBar from "../components/questionnaire/PatientTopBar.vue";
import QuestionnaireCards from "../components/questionnaire/QuestionnaireCards.vue";
import QuestionnaireChecklist from "../components/questionnaire/QuestionnaireChecklist.vue";
import ConsentNotice from "../components/questionnaire/ConsentNotice.vue";
import { apiFetch } from "../composables/useApi";
import { draftKeyFor, purgeExpiredDrafts, useQuestionnaireDraft } from "../composables/useQuestionnaireDraft";
import { MEDICAL_HISTORY_QUESTIONS, STOP_QUESTIONS, checklistItemTitle } from "../config/questionnaires";
import { AppInlineAlert } from "@ui";

/**
 * Public patient page, opened from the QR code a doctor shows (route
 * /q#<token>, no login — the patient has no account). One link can hold
 * several steps — sign the informed consent, answer the medical history,
 * answer S-T-O-P — done one after another, each saved on its own (a patient
 * interrupted halfway keeps what they finished). The token is the only
 * credential: single-use per step, 24h, validated server-side
 * (routes/public.ts). Shows the patient's first name + clinic; the full
 * name only next to the signature pad, while a consent is still to sign.
 *
 * NEO-126: the page wears the app's chrome (logo left, the patient's avatar
 * + menu right) and a consent reads as signing a document: a document card
 * opens a reader, signing unlocks after the last line, the signer sees
 * "signing as … · date", and the thank-you screen hands back the signed PDF.
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
  /** Full name — only while a consent is still to be signed. */
  patient_name?: string | null;
  clinic_name: string | null;
  clinic_email: string | null;
  clinic_phone?: string | null;
  privacy_notice_url: string;
  website_url?: string;
  steps: PublicStep[];
}
interface SignedCopy {
  title: string;
  filename: string;
  signedAt: string;
  pdfBase64: string;
}
interface StepResult {
  step: string;
  completed: boolean;
  signed_copy?: { filename: string; signed_at: string; pdf_base64: string };
}

const CONSENT_PHASES = ["read", "sign", "done"] as const;
/** Average adult silent-reading speed, for the "about N min to read" hint. */
const WORDS_PER_MINUTE = 200;
const DATE_LOCALES: Record<string, string> = { en: "en-GB", pl: "pl-PL", mx: "es-MX" };

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
const signaturePadRef = ref<InstanceType<typeof ConsentSignatureField> | null>(null);
/** The consent pad has an accepted signature — unlocks "Sign and continue". */
const signed = ref(false);
/** The consent reader is open. */
const readerOpen = ref(false);
/** The document was read to its end — the signing area appears. */
const docRead = ref(false);
/** "I have read the document and accept its content." */
const accepted = ref(false);
/** When the signing area appeared — the date shown next to "signing as". */
const signingAt = ref(new Date());
/** Documents signed on this visit, with their PDF copies (kept in memory only). */
const signedCopies = ref<SignedCopy[]>([]);
/** Which card of a questionnaire step is showing; questions.length = the summary. */
const cursor = ref(0);
/** Unsent answers kept on this device (see useQuestionnaireDraft) — null when storage/crypto isn't available. */
const draft = ref<ReturnType<typeof useQuestionnaireDraft> | null>(null);

const steps = computed(() => questionnaire.value?.steps ?? []);
const totalSteps = computed(() => steps.value.length);
const step = computed(() => steps.value.find((s) => !s.done && !skipped.value.has(s.key)) ?? null);
const stepNumber = computed(() => (step.value ? steps.value.indexOf(step.value) + 1 : totalSteps.value));
const stepSegments = computed<SegmentState[]>(() =>
  steps.value.map((s) => (s.done ? "done" : s === step.value ? "current" : "todo")),
);
const stepKey = computed(() => (phase.value === "steps" ? `step-${step.value?.key ?? "none"}` : phase.value));

const questions = computed(() => (step.value?.type === "stop_bang" ? STOP_QUESTIONS : MEDICAL_HISTORY_QUESTIONS));
const useCards = computed(() => step.value?.type === "stop_bang");
const clinicName = computed(() => questionnaire.value?.clinic_name || t("app.questionnaire.yourClinic"));
const unansweredCount = computed(() => questions.value.filter((q) => answers.value[q.key] == null).length);
const allAnswered = computed(() => unansweredCount.value === 0);
const canSend = computed(() => allAnswered.value && consent.value);
const canSign = computed(() => signed.value && accepted.value);
/** 1 = reading, 2 = signing, 3 = done. */
const consentPhase = computed(() => (phase.value === "submitted" ? 3 : docRead.value ? 2 : 1));
const consentSegments = computed<SegmentState[]>(() =>
  CONSENT_PHASES.map((_, index) => (index + 1 < consentPhase.value ? "done" : index + 1 === consentPhase.value ? "current" : "todo")),
);
/** Every step of the link is a document to sign — the thank-you screen then talks about signing. */
const consentOnly = computed(() => steps.value.length > 0 && steps.value.every((s) => s.type === "consent"));
const signerName = computed(() => questionnaire.value?.patient_name || questionnaire.value?.patient_first_name || "");
const readingMinutes = computed(() => {
  const words = (step.value?.consent_html ?? "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
});

function formatStamp(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(DATE_LOCALES[locale.value as string] ?? "es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function onDocumentRead() {
  docRead.value = true;
  signingAt.value = new Date();
}

/** Saves the signed PDF the server handed back — built from memory, nothing is fetched again. */
function downloadCopy(copy: SignedCopy) {
  const bytes = Uint8Array.from(atob(copy.pdfBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = copy.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stepTitle(s: PublicStep): string {
  return checklistItemTitle(t, s.key, s.label);
}

const cardTitle = computed(() => {
  if (phase.value === "invalid") return t("app.questionnaire.invalid.title");
  // The thank-you state carries its own centered heading under the check (not the card's left-aligned title row).
  if (phase.value === "submitted") return null;
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
  cursor.value = 0;
  consent.value = false;
  signed.value = false;
  readerOpen.value = false;
  docRead.value = false;
  accepted.value = false;
  showMissing.value = false;
  submitError.value = false;
  restoreDraft();
}

/** Picks up where the patient left off on this device (same link, same step). Consent is never restored — it's given at send time. */
function restoreDraft() {
  const current = step.value;
  if (!draft.value || !current || current.type === "consent") return;
  const saved = draft.value.load(current.key);
  if (!saved) return;
  const known = new Set(questions.value.map((q) => q.key));
  answers.value = { ...answers.value, ...Object.fromEntries(Object.entries(saved.answers).filter(([key]) => known.has(key))) };
  other.value = saved.other ?? "";
  cursor.value = Math.min(Math.max(0, saved.cursor), questions.value.length);
}

watch([answers, other, cursor], () => {
  const current = step.value;
  if (phase.value !== "steps" || !draft.value || !current || current.type === "consent") return;
  if (!Object.values(answers.value).some((value) => value != null) && !other.value) return;
  draft.value.save(current.key, { answers: answers.value, other: other.value, cursor: cursor.value });
}, { deep: true });

/** This link's device draft (see useQuestionnaireDraft). */
async function openDraft() {
  try {
    draft.value = useQuestionnaireDraft(await draftKeyFor(token.value));
  } catch {
    // benign: no Web Crypto (insecure context, old browser) — the page works, answers just aren't kept on the device.
    draft.value = null;
  }
}

async function load() {
  if (!token.value) {
    phase.value = "invalid";
    return;
  }
  phase.value = "loading";
  questionnaire.value = null;
  skipped.value = new Set();
  signedCopies.value = [];
  purgeExpiredDrafts();
  draft.value = null;
  try {
    const res = await post("lookup", {});
    if (res.status === 410) {
      phase.value = "invalid";
      void openDraft().then(() => draft.value?.clearAll()); // the link is dead — nothing of it stays on the device
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
    // Hashing the token is async; the page is usable meanwhile, and a draft is only restored onto an untouched step.
    void openDraft().then(() => {
      if (!Object.values(answers.value).some((value) => value != null)) restoreDraft();
    });
  } catch (err) {
    reportCaught(err, { where: "PatientQuestionnaireView.load" });
    phase.value = "unreachable";
  }
}

onMounted(load);
watch(token, load);

function advance(completedKey: string, linkCompleted: boolean) {
  draft.value?.clearStep(completedKey);
  if (linkCompleted) draft.value?.clearAll();
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
      draft.value?.clearAll();
      phase.value = "invalid";
      return;
    }
    if (!res.ok) {
      // A patient's answers failed to save — must never be silent. Status/code only, never the answers.
      await reportFailedResponse(res, { where: "PatientQuestionnaireView.send" });
      submitError.value = true;
      return;
    }
    const result = (await res.json()) as StepResult;
    if (result.signed_copy) {
      const done = steps.value.find((s) => s.key === result.step);
      signedCopies.value = [
        ...signedCopies.value,
        {
          title: done ? stepTitle(done) : result.step,
          filename: result.signed_copy.filename,
          signedAt: result.signed_copy.signed_at,
          pdfBase64: result.signed_copy.pdf_base64,
        },
      ];
    }
    advance(result.step, result.completed);
  } catch (err) {
    reportCaught(err, { where: "PatientQuestionnaireView.send" });
    submitError.value = true;
  } finally {
    submitting.value = false;
  }
}

/** "Go to the first one": scrolls the list to the first unanswered question (cards: jumps to it). */
function goToFirstMissing() {
  const index = questions.value.findIndex((q) => answers.value[q.key] == null);
  if (index < 0) return;
  if (useCards.value) {
    cursor.value = index;
    return;
  }
  document.getElementById(`q-${questions.value[index]!.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function submitConsent() {
  const signature = signaturePadRef.value?.isEmpty() ? null : signaturePadRef.value?.toDataURL();
  signed.value = !!signature; // the alerts below read it — the pad is the source of truth at send time
  if (!signature || !accepted.value) {
    showMissing.value = true;
    return;
  }
  if (!step.value) return;
  await send({ step: step.value.key, signatureDataUrl: signature, readToEnd: docRead.value });
}

async function submitQuestionnaire() {
  if (!canSend.value) {
    showMissing.value = true; // the alert above Send + the unanswered rows marked in the list
    return;
  }
  if (!step.value) return;
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
  padding: 0 0 40px;
}

.patient-questionnaire__card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
  margin-top: clamp(16px, 6vh, 56px);
}

/* "Secure link · just for you" — the first thing on every step. */
.patient-questionnaire__secure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 600;
}

.patient-questionnaire__secure-icon {
  width: 14px;
  height: 14px;
}

/* The document itself: a card with a sheet-of-paper icon — tap to open the reader. */
.patient-questionnaire__doc {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 8px;
  padding: 14px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 200ms ease, border-color 200ms ease;
}

.patient-questionnaire__doc:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.patient-questionnaire__doc:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.patient-questionnaire__doc--read {
  border-color: rgba(var(--v-theme-success), 0.5);
}

.patient-questionnaire__doc-sheet {
  position: relative;
  flex: none;
  width: 46px;
  height: 56px;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background:
    repeating-linear-gradient(rgba(var(--v-theme-on-surface), 0.14) 0 2px, transparent 2px 7px) 9px 12px / 26px 30px no-repeat,
    rgb(var(--v-theme-surface));
  box-shadow: 2px 2px 0 rgba(var(--v-theme-on-surface), 0.08);
}

.patient-questionnaire__doc-badge {
  position: absolute;
  right: -7px;
  bottom: -7px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.patient-questionnaire__doc-badge :deep(svg) {
  width: 13px;
  height: 13px;
}

.patient-questionnaire__doc-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.patient-questionnaire__doc-text strong {
  font-size: 1rem;
}

.patient-questionnaire__doc-text span {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-questionnaire__doc-go {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}

.patient-questionnaire__doc--read .patient-questionnaire__doc-go {
  color: rgb(var(--v-theme-success));
}

.patient-questionnaire__doc-go-icon {
  width: 16px;
  height: 16px;
}

.patient-questionnaire__sign {
  margin-top: 20px;
}

/* "You are signing as … · date": who and when, before the tap. */
.patient-questionnaire__signer {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.08);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.patient-questionnaire__signer strong {
  font-weight: 600;
}

.patient-questionnaire__signer span {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.patient-questionnaire__cta {
  margin-top: 16px;
}

/* The receipt for a signed document on the thank-you screen. */
.patient-questionnaire__receipt {
  width: 100%;
  max-width: 340px;
  margin-top: 20px;
  text-align: start;
  animation: pq-rise 450ms ease-out 900ms both;
}

.patient-questionnaire__receipt-rows {
  margin: 0 0 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow: hidden;
  font-size: 0.875rem;
}

.patient-questionnaire__receipt-rows div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.patient-questionnaire__receipt-rows div:first-child {
  border-top: 0;
}

.patient-questionnaire__receipt-rows dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-questionnaire__receipt-rows dd {
  margin: 0;
  font-weight: 600;
  text-align: end;
}

.patient-questionnaire__download-icon {
  width: 18px;
  height: 18px;
  margin-inline-end: 8px;
}

.patient-questionnaire__body {
  padding: 8px 24px 28px;
}

.patient-questionnaire__progress {
  margin-bottom: 16px;
  font-size: 0.875rem;
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

.patient-questionnaire__sign-label {
  margin: 0 0 6px;
  font-weight: 600;
}

.patient-questionnaire__other {
  margin-top: 16px;
}

.patient-questionnaire__finish {
  margin-top: 20px;
}

.patient-questionnaire__consent {
  margin: 12px 0 0;
  align-items: flex-start;
}

/* Looks disabled but still takes the tap, so the patient is told what's missing (a truly disabled button just ignores them). */
.patient-questionnaire__send--locked {
  background-color: rgba(var(--v-theme-on-surface), 0.12) !important;
  color: rgba(var(--v-theme-on-surface), 0.38) !important;
  box-shadow: none !important;
}

.patient-questionnaire__alert {
  margin: 12px 0 16px;
}

.patient-questionnaire__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 32px 44px;
}

/* Fixed-size stage: whatever animates inside, the card's height stays put. */
.patient-questionnaire__done-mark {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  flex: none;
  margin-bottom: 20px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.1);
}

.patient-questionnaire__done-check {
  width: 68px;
  height: 68px;
  fill: none;
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.patient-questionnaire__done-title {
  margin: 0 0 12px;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.2;
}

.patient-questionnaire__done-text {
  max-width: 34ch;
  margin: 0;
  text-wrap: pretty;
  font-size: 1.0625rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.patient-questionnaire__next {
  list-style: none;
  width: 100%;
  max-width: 340px;
  margin: 20px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.patient-questionnaire__next-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.9375rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.patient-questionnaire__next-dot {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.3);
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.patient-questionnaire__next-dot :deep(svg) {
  width: 14px;
  height: 14px;
}

.patient-questionnaire__next-item--done .patient-questionnaire__next-dot {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

/* The "done" moment: the disc settles, the circle and the tick draw themselves, then the text and the next steps rise in.
   Only transform/opacity/stroke move — nothing that changes the card's size. */
@media (prefers-reduced-motion: reduce) {
  .patient-questionnaire__doc {
    transition: none;
  }
  .patient-questionnaire__receipt {
    animation: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .patient-questionnaire__done-mark {
    animation: pq-disc-in 500ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1)) both;
  }
  .patient-questionnaire__done-circle,
  .patient-questionnaire__done-tick {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
  }
  .patient-questionnaire__done-circle {
    animation: pq-draw 600ms cubic-bezier(0.65, 0, 0.35, 1) 150ms forwards;
  }
  .patient-questionnaire__done-tick {
    animation: pq-draw 350ms cubic-bezier(0.65, 0, 0.35, 1) 650ms forwards;
  }
  .patient-questionnaire__done-title,
  .patient-questionnaire__done-text {
    animation: pq-rise 450ms ease-out 850ms both;
  }
  .patient-questionnaire__next-item {
    animation: pq-rise 400ms ease-out both;
  }
  .patient-questionnaire__next-item:nth-child(1) { animation-delay: 1000ms; }
  .patient-questionnaire__next-item:nth-child(2) { animation-delay: 1120ms; }
  .patient-questionnaire__next-item:nth-child(3) { animation-delay: 1240ms; }
}
@keyframes pq-disc-in {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@keyframes pq-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes pq-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 480px) {
  /* Phones: the bar hugs the top edge and the card follows close under it — no dead band above the content. */
  .patient-questionnaire {
    margin-top: calc(-1 * var(--layout-public-inset-top, 16px) + max(8px, env(safe-area-inset-top)));
  }

  .patient-questionnaire__card {
    margin-top: 12px;
  }

  .patient-questionnaire__body {
    padding: 8px 16px 24px;
  }

  .patient-questionnaire__done {
    padding: 36px 24px 40px;
  }
}
</style>
