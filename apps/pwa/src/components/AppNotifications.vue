<template>
  <Teleport to="body">
    <div class="notif-hub" :class="{ 'notif-hub--mobile': isMobile }">
      <TransitionGroup name="notif" tag="div" class="notif-list">
        <div
          v-for="n in notifications"
          :key="n.id"
          class="notif-toast"
          :class="`notif-toast--${n.type}`"
          :role="n.type === 'error' || n.type === 'warning' ? 'alert' : 'status'"
          @touchstart.passive="onTouchStart(n.id, $event)"
          @touchend.passive="onTouchEnd(n.id, $event)"
        >
          <span class="notif-toast__tile">
            <AppIcon :name="n.icon ?? DEFAULT_ICON_BY_TYPE[n.type]" class="notif-toast__icon" />
            <span class="notif-toast__badge">
              <AppIcon :name="BADGE_BY_TYPE[n.type]" />
            </span>
          </span>
          <span class="notif-toast__text">
            <span class="notif-toast__msg">{{ messageOf(n) }}</span>
            <span v-if="n.context" class="notif-toast__context">{{ n.context }}</span>
          </span>
          <button
            v-if="n.action"
            type="button"
            class="notif-toast__action"
            @click="runAction(n)"
          >
            {{ t(n.action.labelKey) }}
          </button>
          <button
            type="button"
            class="notif-toast__close"
            :aria-label="t('notification.dismiss')"
            @click="dismiss(n.id)"
          >
            <AppIcon name="close" />
          </button>
          <div class="notif-toast__bar" :style="{ animationDuration: `${lifetimeOf(n)}ms` }" />
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
import {
  useNotifications,
  type Notification,
  type NotificationIcon,
  type NotificationType,
} from "../composables/useNotifications";
import { MOBILE_BREAKPOINT } from "../constants";

const DURATION = 8000;
/** A toast with a button (Retry…) stays longer, so there is time to reach it. */
const ACTION_DURATION = 12_000;
const SWIPE_DOWN_DISMISS_THRESHOLD = 40;

/** Tile icon when the caller didn't say what the toast is about. */
const DEFAULT_ICON_BY_TYPE: Record<NotificationType, NotificationIcon> = {
  success: "check-circle",
  info: "info-circle",
  warning: "alert-triangle",
  error: "alert-circle",
};

/** The status itself lives on the small badge in the tile's corner. */
const BADGE_BY_TYPE: Record<NotificationType, NotificationIcon> = {
  success: "check",
  info: "info-mark",
  warning: "exclamation",
  error: "close",
};

const { t } = useI18n();
const { notifications, dismiss } = useNotifications();

// Countdown toasts re-render their `{seconds}` once per tick; the clock only
// runs while at least one of them is on screen.
const COUNTDOWN_TICK_MS = 250;
const now = ref(Date.now());
let countdownClock: ReturnType<typeof setInterval> | null = null;

function secondsLeft(n: Notification): number {
  return Math.max(0, Math.ceil((n.shownAt + (n.countdownMs ?? 0) - now.value) / 1000));
}

function lifetimeOf(n: Notification): number {
  return n.countdownMs ?? (n.action ? ACTION_DURATION : DURATION);
}

function runAction(n: Notification): void {
  dismiss(n.id);
  void n.action?.run();
}

function messageOf(n: Notification): string {
  if (!n.key) return n.message;
  return n.countdownMs === undefined ? t(n.key) : t(n.key, { seconds: secondsLeft(n) });
}

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
      // A countdown toast stays until what it announces happens (or the user closes it).
      if (n.countdownMs === undefined && !timers.has(n.id)) {
        timers.set(n.id, setTimeout(() => dismiss(n.id), lifetimeOf(n)));
      }
    }
    const counting = list.some((n) => n.countdownMs !== undefined);
    if (counting && !countdownClock) {
      now.value = Date.now();
      countdownClock = setInterval(() => { now.value = Date.now(); }, COUNTDOWN_TICK_MS);
    } else if (!counting && countdownClock) {
      clearInterval(countdownClock);
      countdownClock = null;
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  if (countdownClock) clearInterval(countdownClock);
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

/* Phone: sit above the bottom nav bar instead of covering it. */
.notif-hub--mobile {
  right: 50%;
  bottom: calc(var(--mobile-bottom-nav-height, 56px) + 12px + env(safe-area-inset-bottom, 0px));
  transform: translateX(50%);
}

.notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* "Record context" toast (NEO-76): white card; the grey tile says what the
   toast is about, the colored badge on it says how it went. Status color
   appears only on the badge, the action button and the time bar. */
.notif-toast {
  --notif-status: var(--pwa-toast-info);
  --notif-status-soft: var(--pwa-toast-info-soft);
  pointer-events: all;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 12px;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  background: var(--pwa-toast-bg);
  border: 1px solid var(--pwa-toast-border);
  box-shadow: var(--pwa-toast-shadow);
  color: var(--pwa-text);
  font-family: var(--pwa-font-sans);
  user-select: none;
  -webkit-user-select: none;
}

.notif-toast--success { --notif-status: var(--pwa-toast-success); --notif-status-soft: var(--pwa-toast-success-soft); }
.notif-toast--warning { --notif-status: var(--pwa-toast-warning); --notif-status-soft: var(--pwa-toast-warning-soft); }
.notif-toast--error   { --notif-status: var(--pwa-toast-error);   --notif-status-soft: var(--pwa-toast-error-soft); }

.notif-toast__tile {
  position: relative;
  flex-shrink: 0;
  align-self: flex-start;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--pwa-toast-tile);
  color: var(--pwa-toast-tile-icon);
  display: grid;
  place-items: center;
}

.notif-toast__icon {
  width: 20px;
  height: 20px;
}

.notif-toast__badge {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--notif-status);
  color: var(--pwa-toast-badge-fg);
  border: 2px solid var(--pwa-toast-bg);
  display: grid;
  place-items: center;
}

.notif-toast__badge :deep(.app-icon) {
  width: 12px;
  height: 12px;
}

.notif-toast__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.notif-toast__msg {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.notif-toast__context {
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--pwa-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-toast__action {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--notif-status-soft);
  color: var(--notif-status);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.notif-toast__action:hover {
  filter: brightness(0.96);
}

.notif-toast__close {
  flex-shrink: 0;
  align-self: flex-start;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  margin: -2px -2px 0 -4px;
  background: none;
  border: none;
  border-radius: 50%;
  color: var(--pwa-text-secondary);
  cursor: pointer;
}
.notif-toast__close :deep(.app-icon) {
  width: 16px;
  height: 16px;
}
.notif-toast__close:hover {
  color: var(--pwa-text);
}

.notif-toast__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--notif-status);
  opacity: 0.55;
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

@media (prefers-reduced-motion: reduce) {
  .notif-toast__bar { animation: none; width: 100%; opacity: 0.25; }
  .notif-move,
  .notif-leave-active,
  .notif-enter-active { transition: opacity 0.15s ease; }
  .notif-enter-from,
  .notif-leave-to,
  .notif-hub--mobile .notif-enter-from,
  .notif-hub--mobile .notif-leave-to { transform: none; }
}
</style>
