<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="520"
    :title="t('app.clinical.email.dialogTitle')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <form id="send-email-form" class="send-email" novalidate @submit.prevent="onSubmit">
      <p class="send-email__to" data-testid="send-email-to">
        <span class="send-email__label">{{ t("app.clinical.email.to") }}</span>
        <span v-if="recipient" class="send-email__address">{{ recipient }}</span>
      </p>
      <AppInlineAlert v-if="!recipient" type="warning" :text="t('app.clinical.email.noEmail')" />

      <fieldset v-else class="send-email__docs">
        <legend class="send-email__label">{{ t("app.clinical.email.documents") }}</legend>
        <p v-if="!items.length" class="send-email__muted">{{ t("app.clinical.email.noneOpen") }}</p>
        <VCheckbox
          v-for="item in items"
          :key="item.key"
          v-model="selected"
          :value="item.key"
          :label="itemTitle(item)"
          :data-testid="`send-email-item-${item.key}`"
          color="primary"
          density="compact"
          hide-details
        />
        <p class="send-email__muted">{{ t("app.clinical.email.validity") }}</p>
      </fieldset>

      <VCheckbox
        v-if="recipient && items.length"
        v-model="copyToMe"
        :label="t('app.clinical.email.copyToMe')"
        color="primary"
        density="compact"
        hide-details
      />
      <p v-if="recipient" class="send-email__hint">
        <AppIcon name="info-circle" class="send-email__hint-icon" />{{ t("app.clinical.email.spamHint") }}
      </p>

      <section class="send-email__history" :aria-label="t('app.clinical.email.history')">
        <h3 class="send-email__label">{{ t("app.clinical.email.history") }}</h3>
        <p v-if="!sends.length" class="send-email__muted">{{ t("app.clinical.email.historyEmpty") }}</p>
        <ul v-else class="send-email__list">
          <li v-for="send in sends" :key="send.id" class="send-email__row" :data-testid="`send-email-row-${send.status}`">
            <span class="send-email__row-what">{{ t(`app.clinical.email.kind.${send.kind}`) }} · {{ send.sent_to_masked }}</span>
            <span class="send-email__row-when">{{ formatDateTime(send.created_at) }}</span>
            <span class="send-email__status" :class="`send-email__status--${tone(send.status)}`" :title="send.status_detail ?? undefined">
              {{ t(`app.clinical.email.status.${send.status}`) }}
            </span>
          </li>
        </ul>
      </section>
    </form>

    <template #actions>
      <AppButton v-if="lastUrl" variant="text" @click="copyLink">{{ t("app.clinical.email.copyLink") }}</AppButton>
      <VSpacer />
      <AppButton variant="text" @click="emit('update:modelValue', false)">{{ t("app.common.close") }}</AppButton>
      <AppButton
        v-if="recipient && items.length"
        color="primary"
        variant="flat"
        type="submit"
        form="send-email-form"
        :loading="sending"
        :disabled="!selected.length"
      >
        {{ t("app.clinical.email.submit") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { AppInlineAlert } from "@ui";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import { useNotifications } from "../../composables/useNotifications";
import type { ChecklistItem, EmailSend, EmailSendStatus } from "../../composables/usePatientChecklist";

/**
 * "Send by email" (NEO-192, NEO-162 stage 1): the doctor picks which of the
 * patient's online documents the emailed link covers, can ask for a
 * link-free confirmation for themselves, and sees what was sent before and
 * whether it arrived (delivery status from Resend, NEO-190). The link itself
 * is shown only as "Copy link" right after sending — it is a credential.
 */
const props = defineProps<{
  modelValue: boolean;
  /** Items the patient can do on the phone (actions.qr). */
  items: ChecklistItem[];
  /** Pre-checked: what the patient hasn't done yet. */
  openKeys: string[];
  /** Masked address the email goes to; null = the record has no email. */
  recipient: string | null;
  sends: EmailSend[];
  sending: boolean;
  /** Link of the email just sent, for "Copy link"; null before sending. */
  lastUrl: string | null;
  itemTitle: (item: ChecklistItem) => string;
  formatDateTime: (value: string) => string;
}>();
const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  send: [payload: { items: string[]; copyToMe: boolean }];
}>();
const { t } = useI18n();
const notifications = useNotifications();

const selected = ref<string[]>([]);
const copyToMe = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    selected.value = props.openKeys.filter((key) => props.items.some((item) => item.key === key));
    copyToMe.value = false;
  },
  { immediate: true }
);

function onSubmit() {
  if (!selected.value.length || props.sending) return;
  emit("send", { items: [...selected.value], copyToMe: copyToMe.value });
}

function tone(status: EmailSendStatus): "ok" | "warn" | "bad" | "neutral" {
  if (status === "delivered") return "ok";
  if (status === "delayed") return "warn";
  if (status === "sent") return "neutral";
  return "bad";
}

async function copyLink() {
  if (!props.lastUrl) return;
  try {
    await navigator.clipboard.writeText(props.lastUrl);
    notifications.show(t("app.clinical.qr.copied"), "success", undefined, { icon: "mail" });
  } catch (err) {
    reportCaught(err, { where: "SendEmailDialog.copyLink", level: "warn" });
  }
}
</script>

<style scoped>
.send-email {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.send-email__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 4px;
  padding: 0;
}
.send-email__to {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 0;
}
.send-email__docs {
  border: 0;
  margin: 0;
  padding: 0;
}
.send-email__muted {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.send-email__hint {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.send-email__hint-icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
}
.send-email__history {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-top: 12px;
}
.send-email__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.send-email__row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "what status" "when status";
  column-gap: 12px;
  font-size: 0.875rem;
}
.send-email__row-what {
  grid-area: what;
}
.send-email__row-when {
  grid-area: when;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.send-email__status {
  grid-area: status;
  align-self: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.send-email__status--ok {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}
.send-email__status--warn {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}
.send-email__status--bad {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}
</style>
