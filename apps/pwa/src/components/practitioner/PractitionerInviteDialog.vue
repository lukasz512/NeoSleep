<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="520"
    :title="t(isResend ? 'user.hcp.invite.titleResend' : 'user.hcp.invite.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <div class="invite">
      <p class="invite__intro">{{ t("user.hcp.invite.intro") }}</p>

      <AppInlineAlert v-if="loadFailed" type="warning" :text="t('user.hcp.invite.loadFailed')" />

      <section class="invite__history" :aria-label="t('user.hcp.invite.history')">
        <h3 class="invite__label">{{ t("user.hcp.invite.history") }}</h3>
        <p v-if="!sends.length" class="invite__muted" data-testid="invite-empty">{{ t("user.hcp.invite.historyEmpty") }}</p>
        <ul v-else class="invite__list">
          <li v-for="send in sends" :key="send.id" class="invite__row" :data-testid="`invite-row-${send.status}`">
            <span class="invite__row-what">{{ t(`user.hcp.invite.kind.${send.kind}`) }} · {{ send.sent_to_masked }}</span>
            <span class="invite__row-when">
              {{ formatDateTime(send.created_at) }}<template v-if="send.sent_by_name"> · {{ t("user.hcp.invite.sentBy", { name: send.sent_by_name }) }}</template>
            </span>
            <span v-if="send.status_detail" class="invite__row-detail">{{ send.status_detail }}</span>
            <EmailStatusChip class="invite__status" :status="send.status" :detail="send.status_detail" />
          </li>
        </ul>
      </section>

      <p v-if="secondsLeft > 0" class="invite__muted" data-testid="invite-cooldown">
        {{ t("user.hcp.invite.cooldown", { time: countdownText }) }}
      </p>
    </div>

    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="emit('update:modelValue', false)">{{ t("app.common.close") }}</AppButton>
      <AppButton
        color="primary"
        variant="flat"
        data-testid="invite-send"
        :loading="sending"
        :disabled="secondsLeft > 0 || sending"
        @click="onSend"
      >
        {{ t(isResend ? "user.hcp.invite.sendAgain" : "user.hcp.invite.send") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { AppInlineAlert } from "@ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import EmailStatusChip from "../EmailStatusChip.vue";
import { apiFetch } from "../../composables/useApi";
import type { EmailSendStatus } from "../../composables/usePatientChecklist";

/**
 * Doctor invite (NEO-273): the log of every invite / thank-you mail sent to
 * this doctor, and an explicit Send button. A resend inside the server's
 * cooldown is refused with 429 + retryAfter, so the button counts down instead
 * of failing.
 */
interface InviteSend {
  id: string;
  kind: "partner_invite" | "partner_thank_you";
  sent_to_masked: string;
  status: EmailSendStatus;
  status_detail: string | null;
  created_at: string;
  sent_by_name: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  practitionerId: string;
  /** True when an invite was already sent (status "invited"). */
  isResend: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  /** The invite was sent; the parent reloads the record. */
  sent: [];
}>();
const { t, locale } = useI18n();

const sends = ref<InviteSend[]>([]);
const loadFailed = ref(false);
const sending = ref(false);
const secondsLeft = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startCountdown(seconds: number) {
  stopTimer();
  secondsLeft.value = Math.max(0, Math.ceil(seconds));
  if (secondsLeft.value === 0) return;
  timer = setInterval(() => {
    secondsLeft.value -= 1;
    if (secondsLeft.value <= 0) {
      secondsLeft.value = 0;
      stopTimer();
    }
  }, 1000);
}

const countdownText = computed(() => {
  const minutes = Math.floor(secondsLeft.value / 60);
  const seconds = String(secondsLeft.value % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
});

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(locale.value === "mx" ? "es-MX" : locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function load() {
  loadFailed.value = false;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${props.practitionerId}/email-sends`, { handleErrors: false });
    if (!res.ok) {
      loadFailed.value = true;
      return;
    }
    const body = (await res.json()) as { sends: InviteSend[]; cooldownSeconds: number };
    sends.value = body.sends;
    startCountdown(body.cooldownSeconds);
  } catch (err) {
    loadFailed.value = true;
    reportCaught(err, { where: "PractitionerInviteDialog.load", level: "warn" });
  }
}

async function onSend() {
  if (sending.value || secondsLeft.value > 0) return;
  sending.value = true;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${props.practitionerId}/activate`, {
      method: "POST",
      handleErrors: false,
    });
    if (res.ok) {
      emit("sent");
      await load();
      return;
    }
    if (res.status === 429) {
      const body = (await res.json()) as { retryAfter?: number };
      startCountdown(body.retryAfter ?? 0);
      return;
    }
    loadFailed.value = true;
  } catch (err) {
    reportCaught(err, { where: "PractitionerInviteDialog.send", level: "warn" });
    loadFailed.value = true;
  } finally {
    sending.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
    else stopTimer();
  },
  { immediate: true }
);
onBeforeUnmount(stopTimer);
</script>

<style scoped>
.invite {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.invite__intro {
  margin: 0;
}
.invite__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 4px;
}
.invite__muted {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.invite__history {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-top: 12px;
}
.invite__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.invite__row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "what status" "when status" "detail status";
  column-gap: 12px;
  font-size: 0.875rem;
}
.invite__row-what {
  grid-area: what;
}
.invite__row-when {
  grid-area: when;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.invite__row-detail {
  grid-area: detail;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-error));
}
.invite__status {
  grid-area: status;
}
</style>
