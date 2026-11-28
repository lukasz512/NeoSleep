import { computed, ref } from "vue";
import { askNeoSleepAi, MAX_AI_QUESTION_CHARS } from "./useAiChat";

/**
 * One question, one answer (CORE-274), shared by the /ai view and the global search palette
 * (CORE-292) so both word every failure the same way. The typed text survives a failure.
 */
export function useAiConversation() {
  const question = ref("");
  const asked = ref("");
  const answer = ref("");
  const errorKey = ref("");
  const loading = ref(false);

  const canAsk = computed(() => {
    const len = question.value.trim().length;
    return !loading.value && len > 0 && len <= MAX_AI_QUESTION_CHARS;
  });

  async function ask(): Promise<void> {
    if (!canAsk.value) return;
    loading.value = true;
    errorKey.value = "";
    answer.value = "";
    const text = question.value.trim();
    try {
      const result = await askNeoSleepAi(text);
      if (result.ok) {
        asked.value = text;
        answer.value = result.answer;
      } else {
        errorKey.value = `ai.error.${result.reason}`;
      }
    } catch {
      errorKey.value = "ai.error.failed";
    } finally {
      loading.value = false;
    }
  }

  function reset(): void {
    question.value = "";
    asked.value = "";
    answer.value = "";
    errorKey.value = "";
  }

  return { question, asked, answer, errorKey, loading, canAsk, ask, reset };
}
