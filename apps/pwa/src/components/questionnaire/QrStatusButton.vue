<template>
  <div v-if="state !== 'hidden'" class="qr-status" :class="`qr-status--${state}`" :data-state="state">
    <button
      type="button"
      class="qr-status__main"
      :aria-label="ariaLabel"
      :aria-busy="state === 'creating'"
      :aria-haspopup="live ? 'dialog' : undefined"
      :aria-expanded="live ? menuOpen : undefined"
      :disabled="state === 'creating' || state === 'done'"
      @click="onMain"
    >
      <span class="qr-status__fill" :style="{ width: fillWidth }" aria-hidden="true" />
      <Transition name="qr-status-icon" mode="out-in">
        <AppIcon :key="icon" :name="icon" class="qr-status__icon" />
      </Transition>
      <span class="qr-status__text">
        <Transition name="qr-status-roll" mode="out-in">
          <span :key="title" class="qr-status__title" :class="{ 'qr-status__title--action': isAction }">{{ title }}</span>
        </Transition>
        <span v-if="subtitle" class="qr-status__subtitle">{{ subtitle }}</span>
      </span>
      <AppIcon v-if="live" name="chevron-down" class="qr-status__chevron" :class="{ 'qr-status__chevron--open': menuOpen }" />
    </button>
    <!-- While the link is live the whole button opens the details (Łukasz, 2026-09-26, option B):
         a new QR kills the link the patient may be filling, so it's a deliberate second tap. -->
    <VMenu
      v-if="live && request"
      v-model="menuOpen"
      activator="parent"
      :open-on-click="false"
      location="bottom end"
      :close-on-content-click="false"
      offset="8"
    >
      <div class="qr-status__menu" role="dialog" :aria-label="t('app.clinical.pending.title')">
        <strong class="qr-status__menu-title">{{ t("app.clinical.pending.title") }} — {{ t("app.clinical.qr.progress", { done, total }) }}</strong>
        <ul class="qr-status__steps">
          <li v-for="key in request.items" :key="key" :class="{ 'qr-status__step--done': request.completed_items.includes(key) }">
            <AppIcon :name="request.completed_items.includes(key) ? 'check-circle' : 'clock'" />
            <span>{{ itemTitle(key) }}</span>
            <small>{{ request.completed_items.includes(key) ? t("app.clinical.status.done") : t("app.clinical.status.missing") }}</small>
          </li>
        </ul>
        <p class="qr-status__expires">{{ t("app.clinical.pending.expires", { time: expiresAt }) }}</p>
        <div v-if="!confirmingCancel" class="qr-status__menu-actions">
          <AppButton variant="text" size="small" @click="onShowAgain">{{ t("app.clinical.pending.showQr") }}</AppButton>
          <AppButton variant="text" size="small" color="error" @click="confirmingCancel = true">{{ t("app.clinical.pending.cancel") }}</AppButton>
        </div>
        <div v-else class="qr-status__menu-actions">
          <span class="qr-status__confirm">{{ t("app.clinical.qrStatus.cancelConfirm") }}</span>
          <AppButton variant="text" size="small" @click="confirmingCancel = false">{{ t("app.clinical.qrStatus.keep") }}</AppButton>
          <AppButton variant="flat" size="small" color="error" @click="onCancel">{{ t("app.clinical.qrStatus.cancelYes") }}</AppButton>
        </div>
      </div>
    </VMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VMenu } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppIcon, { type AppIconName } from "../AppIcon.vue";
import type { PendingRequest } from "../../composables/usePatientChecklist";

/**
 * The Estudios "QR for the patient" button, which is also the status of the
 * patient's one live link (NEO-93, variant B — Łukasz, 2026-09-26): idle →
 * creating → waiting "x of n · expires in hh:mm:ss" with the background
 * filling as steps come in → "All received" for a moment → hidden once the
 * patient has nothing left. A link that ran out unused turns it into "New
 * QR · link expired …"; a failed create into "Retry". While the
 * link is live, tapping the button opens its details: steps, "Show QR
 * again" and "Cancel link" (confirmed inline). Replaces the separate "Waiting for the patient" banner.
 */
const props = defineProps<{
  /** The patient's live link (the API keeps at most one). */
  request: PendingRequest | null;
  /** The newest link when it ran out unused. */
  expired: PendingRequest | null;
  /** Something is still the patient's to fill — otherwise the button hides. */
  available: boolean;
  creating: boolean;
  failed: boolean;
  itemTitle: (key: string) => string;
  formatDateTime: (value: string) => string;
}>();

const emit = defineEmits<{
  create: [];
  showAgain: [items: string[]];
  cancel: [requestId: string];
}>();

const { t } = useI18n();

const DONE_FLASH_MS = 2200;
const now = ref(Date.now());
const doneFlash = ref(false);
const menuOpen = ref(false);
const confirmingCancel = ref(false);
let cancelledId: string | null = null;
let doneTimer: ReturnType<typeof setTimeout> | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;

const remainingMs = computed(() => (props.request ? new Date(props.request.expires_at).getTime() - now.value : 0));
const liveRequest = computed(() => (props.request && remainingMs.value > 0 ? props.request : null));

/** Ran out unused — from the API, or the live link's countdown just hit zero on screen. */
const expiredRequest = computed(() => props.expired ?? (props.request && remainingMs.value <= 0 ? props.request : null));

type State = "hidden" | "idle" | "creating" | "waiting" | "done" | "error" | "expired";
const state = computed<State>(() => {
  if (props.creating) return "creating";
  if (liveRequest.value) return "waiting";
  if (doneFlash.value) return "done";
  if (props.failed) return "error";
  if (!props.available) return "hidden";
  return expiredRequest.value ? "expired" : "idle";
});
const live = computed(() => state.value === "waiting");
const isAction = computed(() => state.value === "idle" || state.value === "error" || state.value === "expired");

const total = computed(() => props.request?.items.length ?? 0);
const done = computed(() => props.request?.completed_items.length ?? 0);
const expiresAt = computed(() => (props.request ? props.formatDateTime(props.request.expires_at) : ""));

const pad = (n: number) => String(n).padStart(2, "0");
const countdown = computed(() => {
  const ms = Math.max(0, remainingMs.value);
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:${pad(Math.floor((ms % 60_000) / 1000))}`;
});

const ICONS: Record<Exclude<State, "hidden">, AppIconName> = {
  idle: "qr-code",
  creating: "qr-code",
  waiting: "clock",
  done: "check",
  error: "alert-circle",
  expired: "refresh",
};
const icon = computed(() => ICONS[state.value === "hidden" ? "idle" : state.value]);

const title = computed(() => {
  switch (state.value) {
    case "creating":
      return t("app.clinical.qrStatus.creating");
    case "waiting":
      return t("app.clinical.pending.title");
    case "done":
      return t("app.clinical.qrStatus.done");
    case "error":
      return t("app.clinical.qrStatus.retry");
    case "expired":
      return t("app.clinical.qrStatus.newQr");
    default:
      return t("app.clinical.bundleQr");
  }
});
const subtitle = computed(() => {
  if (state.value === "waiting") return t("app.clinical.qrStatus.waiting", { done: done.value, total: total.value, time: countdown.value });
  if (state.value === "error") return t("app.clinical.qr.createError");
  if (state.value === "expired" && expiredRequest.value) {
    return t("app.clinical.qrStatus.expired", { time: props.formatDateTime(expiredRequest.value.expires_at) });
  }
  return "";
});
const ariaLabel = computed(() => [title.value, subtitle.value].filter(Boolean).join(" — "));

/** Background = step progress; a sliver while nothing is in yet, so "waiting" still reads as a bar. */
const fillWidth = computed(() => {
  if (state.value === "done") return "100%";
  if (state.value !== "waiting" || !total.value) return "0%";
  return `${Math.max(4, (done.value / total.value) * 100)}%`;
});

function onMain() {
  if (state.value === "waiting") menuOpen.value = !menuOpen.value;
  else if (isAction.value) emit("create");
}
/** A fresh link for what's left — the token of the old one is never stored, so it can't be re-shown. */
function onShowAgain() {
  const request = props.request;
  if (!request) return;
  menuOpen.value = false;
  emit("showAgain", request.items.filter((key) => !request.completed_items.includes(key)));
}
function onCancel() {
  if (!props.request) return;
  cancelledId = props.request.id;
  menuOpen.value = false;
  emit("cancel", props.request.id);
}

// The link left the pending list without us cancelling it and before it
// expired → the patient finished every step: say so for a moment.
watch(
  () => props.request,
  (next, prev) => {
    if (!prev || next?.id === prev.id) return;
    const expired = new Date(prev.expires_at).getTime() <= Date.now();
    if (!next && prev.id !== cancelledId && !expired) {
      doneFlash.value = true;
      clearTimeout(doneTimer);
      doneTimer = setTimeout(() => (doneFlash.value = false), DONE_FLASH_MS);
    }
  }
);
watch(menuOpen, (open) => {
  if (!open) confirmingCancel.value = false;
});
watch(
  live,
  (isLive) => {
    clearInterval(ticker);
    if (isLive) ticker = setInterval(() => (now.value = Date.now()), 1000);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  clearInterval(ticker);
  clearTimeout(doneTimer);
});
</script>

<style scoped>
.qr-status {
  --qr-bg: rgb(var(--v-theme-primary));
  --qr-fg: rgb(var(--v-theme-on-primary));
  --qr-border: rgb(var(--v-theme-primary));
  --qr-border-style: solid;
  display: inline-flex;
  align-items: stretch;
  height: var(--pwa-btn-min-height, 40px);
  max-width: 100%;
  border-radius: var(--pwa-radius-pill, 9999px);
  border: 1.5px var(--qr-border-style) var(--qr-border);
  background: var(--qr-bg);
  color: var(--qr-fg);
  overflow: hidden;
  transition: background-color 0.35s ease, color 0.35s ease, border-color 0.35s ease;
}
.qr-status--creating {
  --qr-bg: rgba(var(--v-theme-primary), 0.12);
  --qr-fg: rgb(var(--v-theme-primary));
  --qr-border: transparent;
}
.qr-status--waiting {
  --qr-bg: rgba(var(--v-theme-warning), 0.08);
  --qr-fg: rgb(var(--v-theme-on-surface));
  --qr-border: rgb(var(--v-theme-warning));
  --qr-border-style: dashed;
}
.qr-status--done {
  --qr-bg: rgb(var(--v-theme-success));
  --qr-fg: rgb(var(--v-theme-on-success));
  --qr-border: rgb(var(--v-theme-success));
}
.qr-status--expired {
  --qr-bg: rgb(var(--v-theme-surface));
  --qr-fg: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  --qr-border: rgba(var(--v-theme-on-surface), 0.35);
  --qr-border-style: dashed;
}
.qr-status--error {
  --qr-bg: rgba(var(--v-theme-error), 0.08);
  --qr-fg: rgb(var(--v-theme-error));
  --qr-border: rgb(var(--v-theme-error));
}

.qr-status__main {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  padding: 0 20px 0 16px;
  color: inherit;
  background: none;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.qr-status__main:disabled {
  cursor: default;
}
.qr-status__main:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -4px;
}
.qr-status__main > :not(.qr-status__fill) {
  position: relative;
}
.qr-status__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(var(--v-theme-warning), 0.22);
  transition: width 0.7s cubic-bezier(0.3, 0.8, 0.3, 1);
}
.qr-status--creating .qr-status__fill {
  width: 100% !important;
  background: repeating-linear-gradient(-45deg, rgba(var(--v-theme-primary), 0.14) 0 8px, transparent 8px 16px);
  background-size: 22.6px 22.6px;
  animation: qr-status-stripe 0.6s linear infinite;
}
.qr-status--done .qr-status__fill {
  background: transparent;
}
@keyframes qr-status-stripe {
  to {
    background-position: 22.6px 0;
  }
}
.qr-status--error {
  animation: qr-status-shake 0.4s;
}
@keyframes qr-status-shake {
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}

.qr-status__icon {
  width: 20px;
  height: 20px;
  flex: none;
}
.qr-status--waiting .qr-status__icon {
  color: rgb(var(--v-theme-warning));
}
.qr-status__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.qr-status__title,
.qr-status__subtitle {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qr-status__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.1;
}
/* Upper case = something to press (idle, retry); sentence case = a status to read. */
.qr-status__title--action {
  text-transform: uppercase;
  letter-spacing: 0.0892em;
}
.qr-status__subtitle {
  font-size: 0.75rem;
  line-height: 1.1;
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}

/* Details open from the whole button while the link is live — the chevron says so.
   It sits at the trailing edge: on phones the pill stretches to the row (NEO-107). */
.qr-status__chevron {
  width: 18px;
  height: 18px;
  flex: none;
  margin-left: auto;
  transition: transform 0.25s ease;
}
.qr-status__chevron--open {
  transform: rotate(180deg);
}
.qr-status--waiting .qr-status__main:hover {
  background: rgba(var(--v-theme-warning), 0.08);
}

.qr-status__menu {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 14px 16px;
  border-radius: var(--pwa-radius);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.08);
}
.qr-status__menu-title {
  font-size: 0.875rem;
}
.qr-status__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.875rem;
}
.qr-status__steps li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.qr-status__steps .app-icon {
  width: 18px;
  height: 18px;
  flex: none;
  color: rgb(var(--v-theme-warning));
}
.qr-status__steps small {
  margin-left: auto;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.qr-status__steps .qr-status__step--done .app-icon,
.qr-status__steps .qr-status__step--done small {
  color: rgb(var(--v-theme-success));
}
.qr-status__expires {
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.qr-status__menu-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.qr-status__confirm {
  font-size: 0.8125rem;
  width: 100%;
}

.qr-status-roll-enter-active,
.qr-status-roll-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.qr-status-roll-enter-from {
  transform: translateY(60%);
  opacity: 0;
}
.qr-status-roll-leave-to {
  transform: translateY(-60%);
  opacity: 0;
}
.qr-status-icon-enter-active {
  transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3), opacity 0.2s ease;
}
.qr-status-icon-leave-active {
  transition: opacity 0.12s ease;
}
.qr-status-icon-enter-from {
  transform: scale(0.4) rotate(-40deg);
  opacity: 0;
}
.qr-status-icon-leave-to {
  opacity: 0;
}

/* Phone: the button shares one row with two 44px icon buttons — while
   waiting, the text needs the room more than the clock does. */
@media (max-width: 600px) {
  .qr-status__main {
    padding: 0 12px 0 14px;
  }
  .qr-status--waiting .qr-status__icon {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .qr-status,
  .qr-status__fill,
  .qr-status__chevron {
    animation: none !important;
    transition: none !important;
  }
}
</style>
