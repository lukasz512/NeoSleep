<template>
  <!-- NEO-221 (D1/D2): the patient list's "Next step" — what still waits on the patient, plus the QR that gets it done.
       Same rule as the patient's side panel (PatientAsidePanel); `compact` (phone card) keeps only the QR. -->
  <span class="next-step" :class="{ 'next-step--compact': compact }">
    <span v-if="!compact" class="next-step__text">
      <span class="next-step__title" :class="{ 'next-step__title--done': !waiting.length }">
        {{ waiting.length ? t("app.patients.detail.aside.waitingOnPatient", { n: waiting.length }) : t("app.patients.detail.aside.allDone") }}
      </span>
      <span class="next-step__items">
        {{ waiting.length ? waiting.map((f) => intakeFormAbbr(t, f.key)).join(" · ") : t("app.patients.detail.aside.nothingForPatient") }}
      </span>
    </span>
    <button
      type="button"
      class="next-step__qr"
      :class="{ 'next-step__qr--done': !waiting.length }"
      :disabled="!waiting.length"
      :aria-label="waiting.length ? `${t('app.patients.detail.aside.qr')} — ${t('app.patients.detail.aside.waitingOnPatient', { n: waiting.length })}` : t('app.patients.detail.aside.allDone')"
      :title="waiting.length ? waiting.map((f) => intakeFormLabel(t, f.key)).join(' · ') : undefined"
      @click.stop="openQr"
    >
      <AppIcon name="qr-code" class="next-step__icon" />
      <span class="next-step__badge" aria-hidden="true">
        <template v-if="waiting.length">{{ waiting.length }}</template>
        <svg v-else viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>
      </span>
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppIcon from "../AppIcon.vue";
import { intakeFormAbbr, intakeFormLabel } from "../../config/patientIntakeForms";
import type { PatientIntakeFormStatus } from "../../types/patientIntakeForm";

const props = withDefaults(defineProps<{ patientId: string; forms: PatientIntakeFormStatus[]; compact?: boolean }>(), { compact: false });

const { t } = useI18n();
const router = useRouter();

const waiting = computed(() => props.forms.filter((f) => f.waiting_on_patient));

/** The QR flow (request, live status, polling) lives on the patient's Documentos tab — open it there (?qr=1, PatientDetailView). */
function openQr(): void {
  void router.push({ name: "patient-detail", params: { id: props.patientId }, query: { qr: "1" } });
}
</script>

<style scoped>
.next-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.next-step--compact {
  display: inline-flex;
}

.next-step__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.next-step__title--done {
  color: rgb(var(--v-theme-success));
}

.next-step__items {
  font-size: 0.78125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-step__qr {
  position: relative;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.next-step__qr:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.5);
  outline-offset: 2px;
}

.next-step__qr--done {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: default;
}

.next-step__icon {
  width: 20px;
  height: 20px;
}

.next-step__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 0.625rem;
  font-weight: 600;
  background: rgb(var(--v-theme-warning));
  color: rgb(var(--v-theme-on-warning));
}

.next-step__qr--done .next-step__badge {
  background: rgb(var(--v-theme-success));
  color: rgb(var(--v-theme-on-success));
}

.next-step__badge svg {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .next-step__qr {
    transition: none;
  }
}
</style>
