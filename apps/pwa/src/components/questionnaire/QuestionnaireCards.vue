<template>
  <div class="q-cards" :class="{ 'q-cards--still': reduceMotion }">
    <!-- Progress: the question letters (S-T-O-P) or a counter + bar. Answered ones can be tapped to go back. -->
    <nav v-if="letters" class="q-cards__letters" :aria-label="t('app.questionnaire.cards.progress')">
      <button
        v-for="(question, index) in questions"
        :key="question.key"
        type="button"
        class="q-cards__letter"
        :class="{
          'q-cards__letter--current': index === cursor,
          'q-cards__letter--done': modelValue[question.key] != null && index !== cursor,
        }"
        :aria-current="index === cursor ? 'step' : undefined"
        :aria-label="t('app.questionnaire.cards.goTo', { n: index + 1, question: t(question.labelKey) })"
        :disabled="!canJumpTo(index)"
        @click="goTo(index)"
      >
        {{ letterFor(question.key) }}
      </button>
    </nav>
    <div v-else class="q-cards__counter">
      <span>{{ onSummary ? t("app.questionnaire.cards.allAnswered") : t("app.questionnaire.cards.questionOf", { n: cursor + 1, total: questions.length }) }}</span>
      <div class="q-cards__bar" aria-hidden="true"><div class="q-cards__bar-fill" :style="{ transform: `scaleX(${answeredCount / questions.length})` }" /></div>
    </div>

    <div class="q-cards__stage">
      <Transition :name="transitionName" mode="out-in">
        <!-- One question per card. -->
        <section v-if="!onSummary && current" :key="current.key" class="q-cards__card" :aria-labelledby="`q-card-${current.key}`">
          <div v-if="iconFor(current.key)" class="q-cards__art" aria-hidden="true">
            <!-- eslint-disable-next-line vue/no-v-html -- our own static SVG paths (stopBangIcons.ts), no user input -->
            <svg viewBox="0 0 24 24" class="q-cards__art-icon" v-html="iconFor(current.key)" />
          </div>
          <div class="q-cards__content">
            <p v-if="letters" class="q-cards__eyebrow">{{ letterFor(current.key) }} · {{ t("app.questionnaire.cards.questionOf", { n: cursor + 1, total: questions.length }) }}</p>
            <h3 :id="`q-card-${current.key}`" class="q-cards__question">{{ t(current.labelKey) }}</h3>
            <p v-if="hintFor(current.key)" class="q-cards__hint">{{ hintFor(current.key) }}</p>
            <div class="q-cards__answers" role="group" :aria-labelledby="`q-card-${current.key}`">
              <button
                v-for="option in OPTIONS"
                :key="String(option.value)"
                type="button"
                class="q-cards__answer"
                :class="{ 'q-cards__answer--on': modelValue[current.key] === option.value }"
                :aria-pressed="modelValue[current.key] === option.value"
                @click="answer(option.value)"
              >
                {{ t(option.labelKey) }}
              </button>
            </div>
            <div class="q-cards__nav">
              <button type="button" class="q-cards__nav-btn" :disabled="cursor === 0" @click="goTo(cursor - 1)">
                ← {{ t("app.questionnaire.cards.back") }}
              </button>
              <button type="button" class="q-cards__nav-btn" :disabled="modelValue[current.key] == null" @click="goTo(cursor + 1)">
                {{ t("app.questionnaire.cards.next") }} →
              </button>
            </div>
          </div>
        </section>

        <!-- After the last question: every answer at a glance, tap one to change it. -->
        <section v-else key="summary" class="q-cards__summary" aria-labelledby="q-cards-summary-title">
          <h3 id="q-cards-summary-title" class="q-cards__summary-title">{{ t("app.questionnaire.cards.review") }}</h3>
          <ul class="q-cards__summary-list">
            <li v-for="(question, index) in questions" :key="question.key">
              <button type="button" class="q-cards__summary-row" @click="goTo(index)">
                <span v-if="letters" class="q-cards__summary-letter">{{ letterFor(question.key) }}</span>
                <span class="q-cards__summary-question">{{ t(question.labelKey) }}</span>
                <span class="q-cards__summary-answer" :class="{ 'q-cards__summary-answer--yes': modelValue[question.key] === true }">
                  {{ answerLabel(modelValue[question.key]) }}
                </span>
              </button>
            </li>
          </ul>
          <p class="q-cards__summary-hint">{{ t("app.questionnaire.cards.tapToChange") }}</p>
        </section>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useMotionPreferenceStore } from "@stores";
import type { QuestionDef } from "../../config/questionnaires";
import { STOP_BANG_ICONS, STOP_BANG_LETTERS } from "./stopBangIcons";

/**
 * Patient self-fill, one question per card (Łukasz, 2026-09-26, "form 1"):
 * a large illustration where the question has one, the question, two big
 * Sí / No buttons. A tap answers and moves on by itself; back / next and
 * the progress letters let the patient revisit an answer. After the last
 * question a summary lists every answer (tap to change) — the parent shows
 * consent + submit under it once `cursor === questions.length`.
 *
 * Generic over yes/no question lists: STOP-Bang (`letters`: S-T-O-P
 * progress and illustrations) and the medical history (counter + bar, no
 * illustrations) share it, so the patient flow has one grammar.
 * Animations: directional slide between cards, button press, letter fill —
 * all off when the user prefers reduced motion (motionPreference store).
 */
const props = defineProps<{
  questions: QuestionDef[];
  modelValue: Record<string, boolean | null>;
  /** 0..questions.length — questions.length is the summary. */
  cursor: number;
  /** STOP-Bang style: letters as progress + line illustrations. */
  letters?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: Record<string, boolean | null>];
  "update:cursor": [value: number];
}>();
const { t } = useI18n();
const reduceMotion = computed(() => useMotionPreferenceStore().shouldReduceMotion);

const OPTIONS = [
  { value: true, labelKey: "app.common.yes" },
  { value: false, labelKey: "app.common.no" },
] as const;
/** Long enough to see the choice light up, short enough not to feel slow. */
const AUTO_ADVANCE_MS = 260;

const transitionName = ref("q-card-forward");
const onSummary = computed(() => props.cursor >= props.questions.length);
const current = computed(() => props.questions[props.cursor] ?? null);
const answeredCount = computed(() => props.questions.filter((q) => props.modelValue[q.key] != null).length);

function letterFor(key: string): string {
  return STOP_BANG_LETTERS[key] ?? "";
}
function iconFor(key: string): string | null {
  return props.letters ? (STOP_BANG_ICONS[key] ?? null) : null;
}
/** Optional clarification under a question. `te()` doesn't see this app's flat dotted keys — "translated to itself" means none. */
function hintFor(key: string): string | null {
  const hintKey = `app.questionnaire.hint.${key}`;
  const hint = t(hintKey);
  return hint === hintKey ? null : hint;
}
function answerLabel(value: boolean | null | undefined): string {
  if (value === true) return t("app.common.yes");
  if (value === false) return t("app.common.no");
  return "—";
}

/** Any answered question, the first unanswered one, and the summary once everything is answered. */
function canJumpTo(index: number): boolean {
  const firstOpen = props.questions.findIndex((q) => props.modelValue[q.key] == null);
  return firstOpen === -1 || index <= firstOpen;
}

function goTo(index: number) {
  const target = Math.max(0, Math.min(index, props.questions.length));
  if (target === props.cursor) return;
  if (target > props.cursor && target !== props.questions.length && !canJumpTo(target)) return;
  if (target === props.questions.length && answeredCount.value < props.questions.length) return;
  transitionName.value = target > props.cursor ? "q-card-forward" : "q-card-back";
  emit("update:cursor", target);
}

let advanceTimer: ReturnType<typeof setTimeout> | null = null;
function answer(value: boolean) {
  const question = current.value;
  if (!question) return;
  emit("update:modelValue", { ...props.modelValue, [question.key]: value });
  if (advanceTimer) clearTimeout(advanceTimer);
  const from = props.cursor;
  advanceTimer = setTimeout(() => {
    advanceTimer = null;
    if (props.cursor !== from) return; // the patient already moved on by hand
    // Next unanswered question, or the summary when everything is answered.
    const answers = { ...props.modelValue, [question.key]: value };
    const nextOpen = props.questions.findIndex((q, i) => i > from && answers[q.key] == null);
    const firstOpen = props.questions.findIndex((q) => answers[q.key] == null);
    goTo(nextOpen !== -1 ? nextOpen : firstOpen !== -1 ? firstOpen : props.questions.length);
  }, reduceMotion.value ? 0 : AUTO_ADVANCE_MS);
}

watch(() => props.questions, () => {
  if (advanceTimer) clearTimeout(advanceTimer);
});
onBeforeUnmount(() => {
  if (advanceTimer) clearTimeout(advanceTimer);
});
</script>

<style scoped>
.q-cards {
  --q-ease: var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
  display: flex;
  flex-direction: column;
  gap: 18px;
  container-type: inline-size;
}

/* --- progress --------------------------------------------------------- */
.q-cards__letters {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.q-cards__letter {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: background-color 280ms var(--q-ease), color 280ms var(--q-ease), border-color 280ms var(--q-ease), transform 280ms var(--q-ease);
}
.q-cards__letter:disabled {
  cursor: default;
  opacity: 0.55;
}
.q-cards__letter--done {
  background: rgba(var(--v-theme-primary), 0.12);
  border-color: transparent;
  color: rgb(var(--v-theme-primary));
}
.q-cards__letter--current {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  transform: scale(1.08);
}
.q-cards__letter:focus-visible,
.q-cards__answer:focus-visible,
.q-cards__nav-btn:focus-visible,
.q-cards__summary-row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.q-cards__counter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.q-cards__bar {
  height: 6px;
  border-radius: 3px;
  background: rgb(var(--v-theme-outline-variant));
  overflow: hidden;
}
.q-cards__bar-fill {
  height: 100%;
  background: rgb(var(--v-theme-primary));
  transform-origin: left center;
  transition: transform 360ms var(--q-ease);
}

/* --- the card ----------------------------------------------------------- */
.q-cards__stage {
  overflow: hidden; /* the slide never shows outside the card */
}
.q-cards__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 4px 2px 2px;
}
.q-cards__art {
  width: 112px;
  height: 112px;
  border-radius: 30px;
  display: grid;
  place-items: center;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  flex: none;
  animation: q-art-in 520ms var(--q-ease) both;
}
.q-cards__art-icon {
  width: 58px;
  height: 58px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.q-cards__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.q-cards__eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}
.q-cards__question {
  margin: 0;
  font-size: 1.3125rem;
  font-weight: 600;
  line-height: 1.3;
  text-wrap: balance;
  max-width: 28ch;
}
.q-cards__hint {
  margin: -4px 0 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.66);
  max-width: 36ch;
}
.q-cards__answers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 400px;
  margin-top: 4px;
}
.q-cards__answer {
  min-height: 60px;
  border-radius: 16px;
  border: 1.5px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 1.125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 200ms var(--q-ease), border-color 200ms var(--q-ease), color 200ms var(--q-ease), transform 140ms var(--q-ease), box-shadow 200ms var(--q-ease);
}
.q-cards__answer:active {
  transform: scale(0.96);
}
.q-cards__answer--on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 6px 18px rgba(var(--v-theme-primary), 0.28);
}
.q-cards__nav {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 400px;
}
.q-cards__nav-btn {
  background: none;
  border: 0;
  padding: 8px 4px;
  min-height: 44px;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}
.q-cards__nav-btn:disabled {
  color: rgba(var(--v-theme-on-surface), 0.3);
  cursor: default;
}

/* Wider screens: illustration on the left, question on the right. */
@container (min-width: 520px) {
  .q-cards__card:has(.q-cards__art) {
    flex-direction: row;
    text-align: left;
    align-items: center;
    gap: 28px;
  }
  .q-cards__card:has(.q-cards__art) .q-cards__content {
    align-items: flex-start;
  }
  .q-cards__art {
    width: 148px;
    height: 148px;
    border-radius: 38px;
  }
  .q-cards__art-icon {
    width: 76px;
    height: 76px;
  }
}

/* --- summary ------------------------------------------------------------ */
.q-cards__summary-title {
  margin: 0 0 6px;
  font-size: 1.125rem;
  font-weight: 600;
}
.q-cards__summary-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.q-cards__summary-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
  background: none;
  font: inherit;
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.q-cards__summary-letter {
  width: 28px;
  height: 28px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  font-size: 0.8125rem;
}
.q-cards__summary-question {
  flex: 1;
  min-width: 0;
  font-size: 0.9375rem;
}
.q-cards__summary-answer {
  flex: none;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.66);
}
.q-cards__summary-answer--yes {
  color: rgb(var(--v-theme-primary));
}
.q-cards__summary-hint {
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* --- motion ------------------------------------------------------------- */
.q-card-forward-enter-active,
.q-card-forward-leave-active,
.q-card-back-enter-active,
.q-card-back-leave-active {
  transition: transform 340ms var(--q-ease), opacity 340ms var(--q-ease);
}
.q-card-forward-enter-from { transform: translateX(40px); opacity: 0; }
.q-card-forward-leave-to { transform: translateX(-40px); opacity: 0; }
.q-card-back-enter-from { transform: translateX(-40px); opacity: 0; }
.q-card-back-leave-to { transform: translateX(40px); opacity: 0; }

@keyframes q-art-in {
  from { transform: scale(0.86) rotate(-4deg); opacity: 0; }
  to { transform: none; opacity: 1; }
}

.q-cards--still *,
.q-cards--still :deep(*) {
  transition: none !important;
  animation: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .q-cards * {
    transition: none !important;
    animation: none !important;
  }
}
</style>
