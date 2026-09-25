<template>
  <section class="consent-notice" :aria-labelledby="titleId">
    <h2 :id="titleId" class="consent-notice__title">
      <AppIcon name="info-circle" class="consent-notice__icon" />
      {{ t("app.questionnaire.consentNotice.title") }}
    </h2>
    <dl class="consent-notice__list">
      <div v-for="item in items" :key="item.key" class="consent-notice__item">
        <dt>{{ t(`app.questionnaire.consentNotice.${item.key}.label`) }}</dt>
        <dd>{{ item.text }}</dd>
      </div>
    </dl>
    <a :href="privacyNoticeUrl" target="_blank" rel="noopener noreferrer" class="consent-notice__link">
      {{ t("app.questionnaire.consentNotice.fullNotice") }}
    </a>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";

/**
 * Layered privacy notice shown before a patient consents to sharing health
 * data (GDPR Art.9 / LFPDPPP datos sensibles): the essentials up front —
 * who is responsible, what, why, who sees it, where and how long, rights —
 * and the full notice one link away. Wording reviewed via /legal
 * (2026-09-25); the consent version stored with each submission is
 * PATIENT_CONSENT_VERSION in apps/api/src/commands/questionnaireRequest.ts —
 * bump it whenever these texts change.
 */
const props = defineProps<{
  clinic: string;
  clinicEmail: string | null;
  privacyNoticeUrl: string;
}>();
const { t } = useI18n();
const titleId = "consent-notice-title";

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
  margin-top: 24px;
  padding: 16px;
  border-radius: var(--pwa-radius);
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.25);
}
.consent-notice__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 600;
}
.consent-notice__icon {
  width: 20px;
  height: 20px;
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
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
  margin-top: 12px;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-primary));
}
</style>
