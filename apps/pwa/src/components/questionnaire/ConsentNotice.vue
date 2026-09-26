<template>
  <section class="consent-notice" :class="{ 'consent-notice--open': open }">
    <button
      type="button"
      class="consent-notice__toggle"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <AppIcon name="info-circle" class="consent-notice__icon" />
      <span class="consent-notice__toggle-label">{{ t("app.questionnaire.consentNotice.toggle") }}</span>
      <AppIcon name="chevron-down" class="consent-notice__chevron" />
    </button>
    <!-- Collapsed on first view (NEO-116): the notice is part of the consent, one tap away, not a wall of text before Send. -->
    <div :id="bodyId" class="consent-notice__body" :inert="!open">
      <div class="consent-notice__inner">
        <dl class="consent-notice__list">
          <div v-for="item in items" :key="item.key" class="consent-notice__item">
            <dt>{{ t(`app.questionnaire.consentNotice.${item.key}.label`) }}</dt>
            <dd>{{ item.text }}</dd>
          </div>
        </dl>
        <a :href="privacyNoticeUrl" target="_blank" rel="noopener noreferrer" class="consent-notice__link">
          {{ t("app.questionnaire.consentNotice.fullNotice") }}
        </a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";

/**
 * Layered privacy notice attached to the patient's health-data consent
 * checkbox (GDPR Art.9 / LFPDPPP datos sensibles): the essentials — who is
 * responsible, what, why, who sees it, where and how long, rights — behind a
 * disclosure right under the checkbox, and the full notice one link away.
 * Wording reviewed via /legal (2026-09-25); the consent version stored with
 * each submission is PATIENT_CONSENT_VERSION in
 * apps/api/src/commands/questionnaireRequest.ts — bump it whenever these
 * texts change.
 */
const props = defineProps<{
  clinic: string;
  clinicEmail: string | null;
  privacyNoticeUrl: string;
}>();
const { t } = useI18n();
const bodyId = "consent-notice-body";
const open = ref(false);

const items = computed(() => [
  { key: "who", text: t("app.questionnaire.consentNotice.who.text", { clinic: props.clinic }) },
  { key: "what", text: t("app.questionnaire.consentNotice.what.text") },
  { key: "why", text: t("app.questionnaire.consentNotice.why.text") },
  { key: "access", text: t("app.questionnaire.consentNotice.access.text") },
  { key: "storage", text: t("app.questionnaire.consentNotice.storage.text") },
  {
    key: "rights",
    text: props.clinicEmail
      ? t("app.questionnaire.consentNotice.rights.text", { email: props.clinicEmail })
      : t("app.questionnaire.consentNotice.rights.textNoEmail"),
  },
]);
</script>

<style scoped>
.consent-notice {
  /* Icon lines up with the checkbox label above (label indent 40px − toggle padding 12px). */
  margin: 0 0 16px 28px;
  border-radius: var(--pwa-radius);
  transition: background-color 0.2s ease;
}
.consent-notice--open {
  background: rgba(var(--v-theme-primary), 0.06);
}
.consent-notice__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 0;
  border-radius: var(--pwa-radius);
  background: none;
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
}
.consent-notice__toggle:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.consent-notice__toggle-label {
  flex: 1;
}
.consent-notice__icon,
.consent-notice__chevron {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.consent-notice__chevron {
  transition: transform 0.25s ease;
}
.consent-notice--open .consent-notice__chevron {
  transform: rotate(180deg);
}
/* Height animates via grid rows (0fr → 1fr), so no measured max-height. */
.consent-notice__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}
.consent-notice--open .consent-notice__body {
  grid-template-rows: 1fr;
}
.consent-notice__inner {
  overflow: hidden;
  min-height: 0;
  padding: 0 12px;
}
.consent-notice__list {
  display: grid;
  gap: 10px;
  margin: 0;
}
.consent-notice__item dt {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}
.consent-notice__item dd {
  margin: 2px 0 0;
  font-size: 0.9375rem;
  line-height: 1.45;
}
.consent-notice__link {
  display: inline-block;
  margin: 12px 0 14px;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-primary));
}
@media (prefers-reduced-motion: reduce) {
  .consent-notice,
  .consent-notice__chevron,
  .consent-notice__body {
    transition: none;
  }
}
</style>
