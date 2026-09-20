<template>
  <Teleport to="body">
    <div class="notif-hub" :class="{ 'notif-hub--mobile': isMobile }">
      <TransitionGroup name="notif" tag="div" class="notif-list">
        <div
          v-for="n in notifications"
          :key="n.id"
          class="notif-toast"
          :class="`notif-toast--${n.type}`"
          role="status"
          @touchstart.passive="onTouchStart(n.id, $event)"
          @touchend.passive="onTouchEnd(n.id, $event)"
        >
          <AppIcon :name="ICON_BY_TYPE[n.type]" class="notif-toast__icon" />
          <span class="notif-toast__msg">{{ n.key ? t(n.key) : n.message }}</span>
          <button
            type="button"
            class="notif-toast__close"
            :aria-label="t('notification.dismiss')"
            @click="dismiss(n.id)"
          >
            <AppIcon name="close" />
          </button>
          <div class="notif-toast__bar" :style="{ animationDuration: `${DURATION}ms` }" />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useDebounceFn } from "@vueuse/core";
import AppIcon from "./AppIcon.vue";
import { useNotifications, type NotificationType } from "../composables/useNotifications";
import { MOBILE_BREAKPOINT } from "../constants";

const DURATION = 8000;
const SWIPE_DOWN_DISMISS_THRESHOLD = 40;

const ICON_BY_TYPE: Record<NotificationType, "check-circle" | "info-circle" | "alert-triangle" | "alert-circle"> = {
  success: "check-circle",
  info: "info-circle",
  warning: "alert-triangle",
  error: "alert-circle",
};

const { t } = useI18n();
const { notifications, dismiss } = useNotifications();

const isMobile = ref(false);
const updateMobile = useDebounceFn(() => {
  if (typeof window === "undefined") return;
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
}, 150);

onMounted(() => {
  updateMobile();
  window.addEventListener("resize", updateMobile);
});
onUnmounted(() => window.removeEventListener("resize", updateMobile));

// Each toast now has its own lifetime (multiple can be visible at once), so
// timers are tracked per notification id rather than one shared timer.
const timers = new Map<number, ReturnType<typeof setTimeout>>();
watch(
  notifications,
  (list) => {
    const liveIds = new Set(list.map((n) => n.id));
    for (const [id, timer] of timers) {
      if (!liveIds.has(id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }
    for (const n of list) {
      if (!timers.has(n.id)) {
        timers.set(n.id, setTimeout(() => dismiss(n.id), DURATION));
      }
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
});

const touchStartY = new Map<number, number>();
function onTouchStart(id: number, e: TouchEvent) {
  touchStartY.set(id, e.touches[0].clientY);
}
function onTouchEnd(id: number, e: TouchEvent) {
  const startY = touchStartY.get(id);
  touchStartY.delete(id);
  if (startY === undefined) return;
  const deltaY = e.changedTouches[0].clientY - startY;
  if (deltaY > SWIPE_DOWN_DISMISS_THRESHOLD) dismiss(id);
}
</script>

<style scoped>
.notif-hub {
  position: fixed;
  bottom: 24px;
  right: 24px;
  /* Must beat the highest forced dialog/menu z-index in theme.scss (.v-menu
     at 10002) — a submit error (e.g. from FormRenderer's .form-renderer-dialog)
     needs to be visible while that same dialog is still open, not hidden behind it. */
  z-index: 10010;
  pointer-events: none;
  width: min(400px, calc(100vw - 32px));
}

.notif-hub--mobile {
  right: 50%;
  transform: translateX(50%);
}

.notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notif-toast {
  pointer-events: all;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px 16px;
  border-radius: 18px;
  overflow: hidden;
  position: relative;
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  background: rgba(20, 20, 30, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 400;
  line-height: 1.4;
  user-select: none;
  -webkit-user-select: none;
}

.notif-toast--success { background: rgba(15, 80, 40, 0.85); }
.notif-toast--error   { background: rgba(110, 20, 20, 0.88); }
.notif-toast--warning { background: rgba(100, 50, 10, 0.85); }
.notif-toast--info    { background: rgba(20, 50, 120, 0.85); }

.notif-toast__icon {
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.9;
}

.notif-toast__msg {
  flex: 1;
  opacity: 0.95;
}

.notif-toast__close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: -2px -4px 0 0;
  background: none;
  border: none;
  color: inherit;
  opacity: 0.75;
  cursor: pointer;
}
.notif-toast__close:hover {
  opacity: 1;
}

.notif-toast__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.45);
  width: 0;
  animation: notif-bar linear forwards;
}

@keyframes notif-bar {
  from { width: 0; }
  to   { width: 100%; }
}

/* Move: existing toasts sliding to their new slot as one enters/leaves. */
.notif-move,
.notif-leave-active {
  transition: transform 0.3s ease, opacity 0.22s ease;
}
.notif-enter-active {
  transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}

/* Desktop (default): slide in/out from the right. */
.notif-enter-from,
.notif-leave-to {
  transform: translateX(48px);
  opacity: 0;
}

/* Mobile: slide up on enter / slide down on exit, from the bottom. The
   container itself is already horizontally centered (.notif-hub--mobile
   above), so individual toasts only need the vertical slide here. */
.notif-hub--mobile .notif-enter-from,
.notif-hub--mobile .notif-leave-to {
  transform: translateY(64px);
  opacity: 0;
}
</style>
