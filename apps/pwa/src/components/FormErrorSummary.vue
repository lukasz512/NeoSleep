<template>
  <div
    v-if="errors.length"
    class="form-error-summary"
    role="alert"
    data-testid="form-error-summary"
  >
    <p class="form-error-summary__title">{{ t("app.formRenderer.errorSummary.title", { n: errors.length }) }}</p>
    <ul class="form-error-summary__list">
      <li v-for="e in errors" :key="e.key">
        <button type="button" class="form-error-summary__link" @click="emit('select', e.key)">
          <span class="form-error-summary__label">{{ e.label }}</span> — {{ e.message }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

/**
 * The red box at the top of a form listing every field still to fix
 * (NEO-109, variant B — the GOV.UK / NHS error-summary pattern). Each line
 * jumps to its field; the list shrinks as fields get fixed, and the box goes
 * away with the last one. The same messages also show under each field —
 * this box only makes sure an error far down a long form isn't missed.
 */
export interface FormErrorSummaryItem {
  key: string;
  label: string;
  message: string;
}

defineProps<{ errors: FormErrorSummaryItem[] }>();

const emit = defineEmits<{ select: [key: string] }>();

const { t } = useI18n();
</script>

<style scoped>
.form-error-summary {
  display: grid;
  gap: 4px;
  margin-bottom: 20px;
  padding: 12px 14px;
  border: 1px solid rgb(var(--v-theme-error));
  border-radius: var(--pwa-radius, 10px);
  background: rgba(var(--v-theme-error), 0.08);
}

.form-error-summary__title {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--v-theme-error));
}

.form-error-summary__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 2px;
}

.form-error-summary__link {
  padding: 2px 0;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  color: rgb(var(--v-theme-error));
  text-decoration: underline;
  text-underline-offset: 2px;
  background: none;
  border: 0;
  cursor: pointer;
}

.form-error-summary__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-error));
  outline-offset: 2px;
  border-radius: 2px;
}

.form-error-summary__label {
  font-weight: 500;
}
</style>
