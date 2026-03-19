<template>
  <VSnackbar
    :model-value="!!current"
    :color="snackbarColor"
    variant="tonal"
    content-class="app-notification-hub__content"
    :class="['app-notification-hub', { 'app-notification-hub--mobile': isMobile }]"
    :timeout="NOTIFICATION_TIMEOUT"
    :location="isMobile ? 'top center' : 'bottom right'"
    @update:model-value="(v) => { if (!v) dismissCurrent(); }"
  >
    <div v-if="current" class="app-notification-hub__inner">
      <div class="app-notification-hub__timer" :style="timerStyle" />
      <div
        ref="wrapRef"
        class="app-notification-hub__wrap"
        :class="{
          'app-notification-hub__wrap--exiting': exiting && !isMobile,
          'app-notification-hub__wrap--exiting-mobile': exiting && isMobile,
        }"
        @transitionend="onTransitionEnd"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
      >
        <span class="app-notification-hub__message" role="status" aria-live="polite">{{ current.message }}</span>
        <button
          type="button"
          class="app-notification-hub__arrow"
          :title="t('notification.dismiss')"
          :aria-label="t('notification.dismiss')"
          @click="startExit"
        >
          <svg
            class="app-notification-hub__arrow-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path v-if="isMobile" d="M18 15l-6-6-6 6" />
            <path v-else d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  </VSnackbar>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useDisplay } from "vuetify";
import { useI18n } from "vue-i18n";
import { useNotifications, type NotificationType } from "../composables/useNotifications";
import { MOBILE_BREAKPOINT } from "../constants";

const NOTIFICATION_TIMEOUT = 4000;

const { current, dismissCurrent } = useNotifications();
const { t } = useI18n();
const { mobile: isMobile } = useDisplay({ mobileBreakpoint: MOBILE_BREAKPOINT });

const wrapRef = ref<HTMLElement | null>(null);
const exiting = ref(false);
let touchStartX = 0;
let touchStartY = 0;

const snackbarColor = computed(() => {
  const type = current.value?.type ?? "info";
  const map: Record<NotificationType, string> = {
    success: "success",
    info: "info",
    warning: "warning",
    error: "error",
  };
  return map[type];
});

const timerStyle = computed(() => ({
  animationDuration: `${NOTIFICATION_TIMEOUT}ms`,
}));

watch(current, (val) => {
  if (val) exiting.value = false;
});

function startExit() {
  exiting.value = true;
}

function onTransitionEnd(e: TransitionEvent) {
  if (e.propertyName === "transform" && exiting.value) {
    dismissCurrent();
    exiting.value = false;
  }
}

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function onTouchEnd(e: TouchEvent) {
  const x = e.changedTouches[0].clientX;
  const y = e.changedTouches[0].clientY;
  const deltaX = x - touchStartX;
  const deltaY = y - touchStartY;
  if (isMobile.value) {
    if (deltaY < -80) startExit();
  } else {
    if (deltaX > 80) startExit();
  }
}
</script>

<style scoped>
.app-notification-hub :deep(.v-snackbar__wrapper) {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  min-height: 0;
  overflow: hidden;
}

.app-notification-hub :deep(.app-notification-hub__content) {
  padding: 14px 24px 12px 24px;
  font-size: 0.875rem;
  font-weight: 400;
  overflow: hidden;
}

.app-notification-hub__inner {
  position: relative;
  width: 100%;
}

.app-notification-hub__wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  transition: transform 0.3s ease;
}

.app-notification-hub__wrap--exiting {
  transform: translateX(calc(100% + 24px));
}

.app-notification-hub__wrap--exiting-mobile {
  transform: translateY(-100%);
}

.app-notification-hub__timer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  margin: 0 -24px;
  background: currentColor;
  opacity: 0.4;
  transform-origin: left;
  animation: app-notification-hub-timer linear forwards;
}

.app-notification-hub--mobile .app-notification-hub__timer {
  bottom: auto;
  top: 0;
  transform-origin: right;
}

@keyframes app-notification-hub-timer {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.app-notification-hub__message {
  flex: 1 1 auto;
  min-width: 0;
  opacity: 0.92;
}

.app-notification-hub__arrow {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, transform 0.2s;
}

.app-notification-hub__arrow:hover,
.app-notification-hub__arrow:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  outline: none;
}

.app-notification-hub__arrow-svg {
  width: 20px;
  height: 20px;
  animation: app-notification-hub-arrow-in 0.35s ease;
}

@keyframes app-notification-hub-arrow-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
