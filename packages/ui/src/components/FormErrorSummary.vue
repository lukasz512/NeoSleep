<template>
  <div
    v-if="errors.length"
    class="form-error-summary"
    role="alert"
    data-testid="form-error-summary"
  >
    <p class="form-error-summary__title">{{ title }}</p>
    <ul class="form-error-summary__list">
      <li v-for="(e, i) in errors" :key="e.key ?? `form-${i}`">
        <button v-if="e.key" type="button" class="form-error-summary__link" @click="emit('select', e.key)">
          <span v-if="e.label" class="form-error-summary__label">{{ e.label }} — </span>{{ e.message }}
        </button>
        <span v-else class="form-error-summary__text">{{ e.message }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The red box at the top of every form listing what's still to fix
 * (NEO-109, variant B — the GOV.UK / NHS error-summary pattern). A line with
 * a `key` jumps to its field (`select`); one without is about the whole form
 * (e.g. "wrong email or password") and is plain text. The list shrinks as
 * fields get fixed, and the box goes away with the last line. Field messages
 * also show under each field — this box makes sure none is missed.
 *
 * Takes its title as a prop so it stays i18n-agnostic (the PWA passes
 * `app.formRenderer.errorSummary.title`).
 */
export interface FormErrorSummaryLine {
  /** The field to jump to; omit for a form-level error. */
  key?: string;
  label?: string;
  message: string;
}

defineProps<{ errors: FormErrorSummaryLine[]; title: string }>();

const emit = defineEmits<{ select: [key: string] }>();
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

.form-error-summary__link,
.form-error-summary__text {
  padding: 2px 0;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  color: rgb(var(--v-theme-error));
}

.form-error-summary__link {
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
