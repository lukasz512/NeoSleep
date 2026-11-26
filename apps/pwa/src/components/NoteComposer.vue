<template>
  <div class="note-composer" :class="{ 'note-composer--focused': focused }">
    <VTextarea
      v-model="draft"
      class="note-composer__field"
      :placeholder="placeholder"
      :aria-label="placeholder"
      variant="plain"
      density="compact"
      :rows="rows"
      auto-grow
      hide-details
      @focus="focused = true"
      @blur="focused = false"
      @keydown.enter="onEnter"
    />
    <div class="note-composer__footer">
      <span class="note-composer__hint">{{ t("app.notes.submitHint", { keys: shortcutLabel }) }}</span>
      <AppButton
        color="primary"
        variant="flat"
        size="small"
        class="note-composer__submit text-none"
        :loading="loading"
        :disabled="!draft.trim()"
        @click="submit"
      >
        {{ t("app.notes.submit") }}
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NEO-153 note compose box — the field and its "Add" button in one outlined
 * block, Ctrl/Cmd+Enter to submit. Shared by the Notes tab (PatientNotesPanel)
 * and the desktop side panel (PatientAsidePanel); the caller owns saving and
 * clears the draft once the note is stored.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VTextarea } from "vuetify/components";
import AppButton from "./AppButton.vue";

withDefaults(
  defineProps<{
    placeholder: string;
    loading?: boolean;
    rows?: number;
  }>(),
  { loading: false, rows: 2 },
);

const emit = defineEmits<{
  submit: [body: string];
}>();

const draft = defineModel<string>({ default: "" });
const focused = ref(false);

const { t } = useI18n();

const isApple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const shortcutLabel = computed(() => (isApple ? "⌘ + Enter" : "Ctrl + Enter"));

function submit(): void {
  if (!draft.value.trim()) return;
  emit("submit", draft.value);
}

function onEnter(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  submit();
}
</script>

<style scoped>
.note-composer {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.03);
  transition: border-color 150ms ease;
}

.note-composer--focused {
  border-color: rgb(var(--v-theme-primary));
}

.note-composer__field :deep(.v-field__input) {
  padding: var(--space-3, 12px) var(--space-4, 16px) var(--space-1, 4px);
}

.note-composer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-1, 4px) var(--space-2, 8px) var(--space-2, 8px) var(--space-4, 16px);
}

.note-composer__hint {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* The hint is a keyboard affordance — phones have no Ctrl/Cmd key. */
@media (hover: none) and (pointer: coarse) {
  .note-composer__hint {
    visibility: hidden;
  }
}
</style>
