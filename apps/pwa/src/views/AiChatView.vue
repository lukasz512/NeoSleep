<template>
  <div class="view-ai">
    <p class="view-ai__subtitle">{{ t("ai.subtitle") }}</p>

    <form class="view-ai__form" data-testid="ai-form" @submit.prevent="ask">
      <textarea
        v-model="question"
        class="view-ai__input"
        rows="3"
        :maxlength="MAX_AI_QUESTION_CHARS"
        :placeholder="t('ai.placeholder')"
        :aria-label="t('ai.placeholder')"
        data-testid="ai-question"
      />
      <div class="view-ai__bar">
        <span class="view-ai__count">{{ question.length }} / {{ MAX_AI_QUESTION_CHARS }}</span>
        <AppButton type="submit" :disabled="!canAsk" data-testid="ai-ask">{{ t("ai.ask") }}</AppButton>
      </div>
    </form>

    <AppLoadingState v-if="loading" />
    <p v-else-if="errorKey" class="view-ai__error" role="alert" data-testid="ai-error">{{ t(errorKey) }}</p>
    <section v-else-if="answer" class="view-ai__answer" data-testid="ai-answer">
      <h2 class="view-ai__asked">{{ asked }}</h2>
      <p class="view-ai__text">{{ answer }}</p>
      <p class="view-ai__note">{{ t("ai.note") }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "../components/AppButton.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import { MAX_AI_QUESTION_CHARS } from "../composables/useAiChat";
import { useAiConversation } from "../composables/useAiConversation";

const { t } = useI18n();
const { question, asked, answer, errorKey, loading, canAsk, ask } = useAiConversation();
</script>

<style scoped>
.view-ai {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}
.view-ai__subtitle,
.view-ai__note,
.view-ai__count {
  color: var(--neo-text-muted, #6b7280);
  margin: 0;
}
.view-ai__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.view-ai__input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--neo-border, #d1d5db);
  border-radius: 8px;
  font: inherit;
  resize: vertical;
}
.view-ai__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.view-ai__asked {
  font-size: 16px;
  margin: 0 0 8px;
}
.view-ai__text {
  white-space: pre-wrap;
  margin: 0 0 8px;
}
.view-ai__error {
  color: var(--neo-error, #b91c1c);
  margin: 0;
}
</style>
