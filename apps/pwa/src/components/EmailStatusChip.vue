<template>
  <span class="email-status" :class="`email-status--${tone}`" :title="detail ?? undefined" data-testid="email-status-chip">
    {{ t(`app.clinical.email.status.${status}`) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { EmailSendStatus } from "../composables/usePatientChecklist";

/**
 * Delivery status of one sent email (NEO-190, NEO-273). One component and one
 * wording for every recipient type: the patient email log and the doctor
 * invite log both render it.
 */
const props = defineProps<{
  status: EmailSendStatus;
  /** Provider detail (bounce reason, ...); shown as a tooltip. */
  detail?: string | null;
}>();
const { t } = useI18n();

const tone = computed<"ok" | "warn" | "bad" | "neutral">(() => {
  if (props.status === "delivered") return "ok";
  if (props.status === "delayed") return "warn";
  if (props.status === "sent") return "neutral";
  return "bad";
});
</script>

<style scoped>
.email-status {
  align-self: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.email-status--ok {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}
.email-status--warn {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}
.email-status--bad {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}
</style>
